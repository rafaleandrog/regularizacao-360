import { Router } from 'express';
import {
  hoje,
  amanha,
  soData,
  estaAprovada,
  selecionarVigente,
  montarCadeia,
  apenasEditaveis,
  dentroDaJanelaVencimento,
} from '../comum/cascata.js';

/**
 * Rotas da app Regularização 360 (reg360).
 *
 * A tabela `propostas` usa `acesso_externo: "restrito"` — todo CRUD passa por
 * estas rotas, que aplicam regras de role, imutabilidade pós-aprovação e a
 * resolução de proposta vigente em cascata (Setor → Parcelamento → Unidade).
 * A lógica pura de vigência/cascata vive em `comum/cascata.ts` (testada).
 *
 * Eventos: as rotas de criar/aprovar chamam `publicarSeguro` (best-effort). A
 * declaração dos eventos no manifesto, as inscrições automáticas e a rotina de
 * vencimento entram na Fase 3.
 */
export const rotas: ReturnType<typeof Router> = Router();

// ---------------------------------------------------------------------------
// Autorização
// ---------------------------------------------------------------------------

function roles(req: any): string[] {
  return req.contexto?.rolesApp || [];
}
function ehAdmin(req: any): boolean {
  return req.contexto?.nivelApp === 'admin';
}
function podeCriar(req: any): boolean {
  return ehAdmin(req) || roles(req).includes('criador');
}
function podeAprovar(req: any): boolean {
  return ehAdmin(req) || roles(req).includes('validador_interno');
}

function erro(res: any, status: number, codigo: string, mensagem: string) {
  return res.status(status).json({ erro: true, codigo, mensagem });
}

// ---------------------------------------------------------------------------
// Eventos (best-effort; ativados de fato na Fase 3)
// ---------------------------------------------------------------------------

async function publicarSeguro(req: any, tipo: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await req.eventos?.publicar(tipo, payload);
  } catch (err) {
    console.warn(`[reg360] Falha ao publicar evento ${tipo}:`, err);
  }
}

/**
 * Garante inscrição (idempotente) dos validadores internos atuais em
 * `proposta_criada`. O shell não emite hook de atribuição de role, então
 * enumeramos sob demanda e confiamos no único de inscrição para deduplicar —
 * mesmo padrão de apps/fabrica (garantirInscricoesAprovadores).
 */
async function garantirInscricoesValidadores(req: any): Promise<void> {
  try {
    const ids: number[] = await req.shell!.listarUsuariosPorRole('validador_interno');
    for (const id of ids) {
      await req.eventos!.inscreverUsuario(id, 'app.reg360.proposta_criada', {}, 'forte', 'validador');
    }
  } catch (err) {
    console.warn('[reg360] Falha ao inscrever validadores em proposta_criada:', err);
  }
}

/** Inscreve o criador em `proposta_aprovada` filtrado por aquela proposta. */
async function inscreverCriadorEmAprovacao(req: any, propostaId: number, criadorId: number | null): Promise<void> {
  if (!criadorId) return;
  try {
    await req.eventos!.inscreverUsuario(
      criadorId,
      'app.reg360.proposta_aprovada',
      { proposta_id: propostaId },
      'forte',
      'criador',
    );
  } catch (err) {
    console.warn('[reg360] Falha ao inscrever criador em proposta_aprovada:', err);
  }
}

// ---------------------------------------------------------------------------
// Sanidade
// ---------------------------------------------------------------------------

// GET /api/reg360/ping — sanidade do mount da app
rotas.get('/ping', (req, res) => {
  res.json({
    ok: true,
    app: 'reg360',
    usuario: req.contexto?.usuario?.nome ?? null,
    nivel: req.contexto?.nivelApp ?? null,
  });
});

// ---------------------------------------------------------------------------
// Propostas
// ---------------------------------------------------------------------------

// GET /api/reg360/propostas — listar com filtros
rotas.get('/propostas', async (req, res) => {
  try {
    const filtros: Record<string, unknown> = {};
    if (req.query.nivel) filtros.nivel = req.query.nivel;
    if (req.query.ref_id) filtros.ref_id = Number(req.query.ref_id);
    if (req.query.tipo_proposta) filtros.tipo_proposta = req.query.tipo_proposta;
    if (req.query.status_aprovacao) filtros.status_aprovacao = req.query.status_aprovacao;

    const resultado = await req.dados!.listar('propostas', {
      filtros,
      ordenar: 'data_proposta',
      ordem: 'desc',
    });
    res.json(resultado);
  } catch (err: any) {
    erro(res, 500, 'REG360_LISTAR_FALHOU', err?.message || 'Falha ao listar propostas');
  }
});

// GET /api/reg360/propostas/vigente — resolver a proposta vigente em cascata
// Params: nivel, ref_id (obrigatórios); parcelamento_id, setor_id (opcionais,
// para subir a cascata quando o chamador conhece os pais).
// IMPORTANTE: registrada antes de `/propostas/:id` para não colidir com o param.
rotas.get('/propostas/vigente', async (req, res) => {
  try {
    const nivel = String(req.query.nivel || '');
    const refId = Number(req.query.ref_id);
    if (!['setor', 'parcelamento', 'unidade'].includes(nivel) || !Number.isInteger(refId)) {
      return erro(res, 400, 'REG360_PARAMS_INVALIDOS', 'Informe nivel (setor|parcelamento|unidade) e ref_id');
    }
    const pais = {
      parcelamento_id: req.query.parcelamento_id ? Number(req.query.parcelamento_id) : null,
      setor_id: req.query.setor_id ? Number(req.query.setor_id) : null,
    };
    const ref = hoje();
    const cadeia = montarCadeia(nivel, refId, pais);

    for (const candidato of cadeia) {
      const { dados } = await req.dados!.listar('propostas', {
        filtros: { nivel: candidato.nivel, ref_id: candidato.ref_id, status_aprovacao: 'aprovada' },
      });
      const vigente = selecionarVigente(dados, ref);
      if (vigente) {
        return res.json({ vigente, origem_cascata: candidato.nivel });
      }
    }
    res.json({ vigente: null, origem_cascata: null });
  } catch (err: any) {
    erro(res, 500, 'REG360_CASCATA_FALHOU', err?.message || 'Falha ao resolver cascata');
  }
});

// GET /api/reg360/propostas/:id — detalhe
rotas.get('/propostas/:id', async (req, res) => {
  try {
    const proposta = await req.dados!.buscar('propostas', Number(req.params.id));
    if (!proposta) return erro(res, 404, 'REG360_NAO_ENCONTRADA', 'Proposta não encontrada');
    res.json(proposta);
  } catch (err: any) {
    erro(res, 500, 'REG360_BUSCAR_FALHOU', err?.message || 'Falha ao buscar proposta');
  }
});

// POST /api/reg360/propostas — criar (role criador)
rotas.post('/propostas', async (req, res) => {
  try {
    if (!podeCriar(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem criar propostas');
    }
    const dados = apenasEditaveis(req.body);
    dados.status_aprovacao = 'pendente';
    dados.criado_por_id = req.contexto?.usuario?.id ?? null;

    const criada = await req.dados!.criar('propostas', dados);

    // Inscrições: validadores no evento de criação; criador no de aprovação desta proposta.
    await garantirInscricoesValidadores(req);
    await inscreverCriadorEmAprovacao(req, criada.id, req.contexto?.usuario?.id ?? null);

    await publicarSeguro(req, 'proposta_criada', {
      proposta_id: criada.id,
      titulo: criada.titulo,
      nivel: criada.nivel,
      tipo_proposta: criada.tipo_proposta,
      preco_m2: criada.preco_m2,
      data_proposta: soData(criada.data_proposta),
      data_fim_vigencia: soData(criada.data_fim_vigencia),
      criador: req.contexto?.usuario?.nome ?? null,
    });

    res.status(201).json(criada);
  } catch (err: any) {
    erro(res, 422, 'REG360_CRIAR_FALHOU', err?.message || 'Falha ao criar proposta');
  }
});

// PATCH /api/reg360/propostas/:id — editar (bloqueado se aprovada; RN-03)
rotas.patch('/propostas/:id', async (req, res) => {
  try {
    if (!podeCriar(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem editar propostas');
    }
    const id = Number(req.params.id);
    const atual = await req.dados!.buscar('propostas', id);
    if (!atual) return erro(res, 404, 'REG360_NAO_ENCONTRADA', 'Proposta não encontrada');

    if (estaAprovada(atual) && !ehAdmin(req)) {
      return erro(res, 409, 'REG360_IMUTAVEL', 'Proposta aprovada não pode ser alterada (somente admin)');
    }

    const dados = apenasEditaveis(req.body);
    const atualizada = await req.dados!.atualizar('propostas', id, dados);
    res.json(atualizada);
  } catch (err: any) {
    erro(res, 422, 'REG360_EDITAR_FALHOU', err?.message || 'Falha ao editar proposta');
  }
});

// POST /api/reg360/propostas/:id/aprovar — aprovar (role validador_interno)
rotas.post('/propostas/:id/aprovar', async (req, res) => {
  try {
    if (!podeAprovar(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas validadores internos podem aprovar propostas');
    }
    const id = Number(req.params.id);
    const atual = await req.dados!.buscar('propostas', id);
    if (!atual) return erro(res, 404, 'REG360_NAO_ENCONTRADA', 'Proposta não encontrada');
    if (estaAprovada(atual)) {
      return erro(res, 409, 'REG360_JA_APROVADA', 'Proposta já está aprovada');
    }

    const aprovada = await req.dados!.atualizar('propostas', id, {
      status_aprovacao: 'aprovada',
      aprovado_por_id: req.contexto?.usuario?.id ?? null,
    });

    await publicarSeguro(req, 'proposta_aprovada', {
      proposta_id: aprovada.id,
      titulo: aprovada.titulo,
      nivel: aprovada.nivel,
      tipo_proposta: aprovada.tipo_proposta,
      aprovador: req.contexto?.usuario?.nome ?? null,
    });

    res.json(aprovada);
  } catch (err: any) {
    erro(res, 422, 'REG360_APROVAR_FALHOU', err?.message || 'Falha ao aprovar proposta');
  }
});

// POST /api/reg360/propostas/:id/copiar — duplicar como nova pendente (RN-08)
rotas.post('/propostas/:id/copiar', async (req, res) => {
  try {
    if (!podeCriar(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem copiar propostas');
    }
    const origem = await req.dados!.buscar('propostas', Number(req.params.id));
    if (!origem) return erro(res, 404, 'REG360_NAO_ENCONTRADA', 'Proposta de origem não encontrada');

    // Base = campos da origem; o corpo da requisição pode sobrescrever (datas/valores).
    const dados = { ...apenasEditaveis(origem), ...apenasEditaveis(req.body) };
    dados.status_aprovacao = 'pendente';
    dados.criado_por_id = req.contexto?.usuario?.id ?? null;

    const copia = await req.dados!.criar('propostas', dados);

    await garantirInscricoesValidadores(req);
    await inscreverCriadorEmAprovacao(req, copia.id, req.contexto?.usuario?.id ?? null);

    await publicarSeguro(req, 'proposta_criada', {
      proposta_id: copia.id,
      titulo: copia.titulo,
      nivel: copia.nivel,
      tipo_proposta: copia.tipo_proposta,
      preco_m2: copia.preco_m2,
      data_proposta: soData(copia.data_proposta),
      data_fim_vigencia: soData(copia.data_fim_vigencia),
      criador: req.contexto?.usuario?.nome ?? null,
    });

    res.status(201).json(copia);
  } catch (err: any) {
    erro(res, 422, 'REG360_COPIAR_FALHOU', err?.message || 'Falha ao copiar proposta');
  }
});

// ---------------------------------------------------------------------------
// Transações (preparadas; dependem do módulo Transação no Núcleo).
// Enquanto a entidade não existir no Núcleo, retornam 501 (RN-09).
// ---------------------------------------------------------------------------

function transacaoIndisponivel(res: any) {
  return erro(
    res,
    501,
    'REG360_TRANSACAO_INDISPONIVEL',
    'Transações estarão disponíveis quando a entidade Transação existir no Núcleo.',
  );
}

rotas.post('/transacoes', (_req, res) => transacaoIndisponivel(res));
rotas.post('/transacoes/:id/aprovar', (_req, res) => transacaoIndisponivel(res));

// ---------------------------------------------------------------------------
// Rotinas — o shell descobre `export const rotinas` e agenda conforme o manifesto
// ---------------------------------------------------------------------------

export const rotinas = {
  /**
   * RN-02 / spec §5.3 — diariamente, alerta os validadores internos sobre
   * Propostas Tabela de Setor Habitacional a até 24h do vencimento. A flag
   * `notificacao_vencimento_enviada` garante notificação única (idempotência).
   * ctx = { dados, eventos, shell, notificacoes, slack, ... } (sem usuário).
   */
  checar_propostas_vencendo: async (ctx: any) => {
    const ref = hoje();
    const limite = amanha();

    const { dados: candidatas } = await ctx.dados!.listar('propostas', {
      filtros: {
        nivel: 'setor',
        tipo_proposta: 'tabela',
        status_aprovacao: 'aprovada',
        notificacao_vencimento_enviada: false,
      },
      por_pagina: 200,
    });

    const vencendo = (candidatas || []).filter((p: any) => dentroDaJanelaVencimento(p, ref, limite));
    if (vencendo.length === 0) {
      return { ok: true, resultado: { resumo: 'Nenhuma Proposta Tabela vencendo', notificadas: 0 } };
    }

    const validadores: number[] = await ctx.shell!.listarUsuariosPorRole('validador_interno');
    let notificadas = 0;

    for (const p of vencendo) {
      if (validadores.length > 0) {
        const msg = `Proposta Tabela "${p.titulo}" (Setor ${p.ref_id}) vence em ${soData(p.data_fim_vigencia)}. Renove ou crie nova proposta.`;
        for (const id of validadores) {
          await ctx.notificacoes!.notificar(id, msg, { rota: `proposta/${p.id}` });
        }
        // Só marca a flag após notificar de fato — se não há validador, tenta de novo amanhã.
        await ctx.dados!.atualizar('propostas', p.id, { notificacao_vencimento_enviada: true });
        notificadas++;
      }
    }

    return {
      ok: true,
      resultado: {
        resumo: `${notificadas} proposta(s) sinalizada(s) a ${validadores.length} validador(es)`,
        notificadas,
        validadores: validadores.length,
      },
    };
  },
};
