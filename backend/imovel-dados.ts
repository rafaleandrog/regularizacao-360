import { Router } from 'express';
import { proximaPagina } from '../comum/paginacao.js';
import { upsertPorChave } from './upsert.js';
import { semCamposProtegidos, apenasEditaveisImovel } from '../comum/quitacao.js';

/**
 * Rotas de `imovel_dados` — dados que a UP mantém por imóvel e que não existem
 * no Núcleo.
 *
 * O **preço estático** tem regra própria e é por isso que ele não divide rota
 * com o resto: ele é o registro de um contrato firmado — enquanto a integração
 * com as Transações do Núcleo não estiver ligada (#80), é o único lugar onde o
 * valor combinado sobrevive. Se puder ser sobrescrito por engano, o campo perde
 * inteiramente o propósito.
 */

const TIPOS = new Set(['lote', 'unidade']);
/** Teto de cliente do framework de dados: pedir mais devolve fatia, sem erro. */
const POR_PAGINA = 100;

function erro(res: any, status: number, codigo: string, mensagem: string) {
  return res.status(status).json({ erro: true, codigo, mensagem });
}

function ehAdmin(req: any): boolean {
  return req.contexto?.nivelApp === 'admin';
}
function podeCriar(req: any): boolean {
  return ehAdmin(req) || (req.contexto?.rolesApp || []).includes('criador');
}
/**
 * Quitação é **constatação financeira**, não cadastro — o mesmo perfil que
 * aprova proposta. `criador` cadastra dado; quem afirma que a dívida acabou é
 * quem tem alçada para isso.
 */
function podeQuitar(req: any): boolean {
  return ehAdmin(req) || (req.contexto?.rolesApp || []).includes('validador_interno');
}

function lerAlvo(req: any): { imovelId: number; imovelTipo: string } | { erro: string } {
  const imovelTipo = String(req.params.tipo || '');
  const imovelId = Number(req.params.id);
  if (!TIPOS.has(imovelTipo)) return { erro: `tipo deve ser ${[...TIPOS].join(' ou ')}` };
  if (!Number.isInteger(imovelId) || imovelId < 1) return { erro: 'id deve ser inteiro positivo' };
  return { imovelId, imovelTipo };
}

function precoValido(v: unknown): number | null | { erro: string } {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { erro: 'preço deve ser número >= 0 ou null' };
  return n;
}

/** Hoje em `YYYY-MM-DD`, fuso local do processo — igual a `comum/cascata.ts`. */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Busca o registro do imóvel, ou `null`. */
async function buscarDados(req: any, imovelId: number, imovelTipo: string) {
  const { dados } = await req.dados!.listar('imovel_dados', {
    filtros: { imovel_id: imovelId, imovel_tipo: imovelTipo },
    por_pagina: 1,
  });
  return dados?.[0] ?? null;
}

/**
 * O registro nasce na primeira escrita. A corrida no único
 * `(imovel_id, imovel_tipo)` é tratada em `backend/upsert.ts` — transação
 * sozinha não a fecha.
 */
async function salvar(req: any, imovelId: number, imovelTipo: string, campos: Record<string, unknown>) {
  return upsertPorChave(req.dados!, {
    tabela: 'imovel_dados',
    chave: { imovel_id: imovelId, imovel_tipo: imovelTipo },
    dados: campos,
  });
}

export const rotasImovelDados: ReturnType<typeof Router> = Router();

// GET /api/reg360/imovel-dados — todos, para o VGV agregar no cliente.
// Existe porque o agregado precisa do preço de CADA lote, e uma requisição por
// lote seria uma por linha. Pagina em laço pelo mesmo motivo de
// `parcelamento-dados`: `listar` devolve fatia sem erro quando se pede demais.
rotasImovelDados.get('/imovel-dados', async (req, res) => {
  try {
    const filtros: Record<string, unknown> = {};
    if (req.query.imovel_tipo) filtros.imovel_tipo = String(req.query.imovel_tipo);

    const acumulado: Record<string, any>[] = [];
    let pagina: number | null = 1;
    while (pagina !== null) {
      const resposta: any = await req.dados!.listar('imovel_dados', { filtros, pagina, por_pagina: POR_PAGINA });
      acumulado.push(...(resposta?.dados || []));
      pagina = proximaPagina(resposta, pagina, acumulado.length);
    }
    res.json({ dados: acumulado });
  } catch (err: any) {
    erro(res, 500, 'REG360_LISTAR_FALHOU', err?.message || 'Falha ao listar dados de imóveis');
  }
});

// GET /api/reg360/imovel-dados/:tipo/:id
rotasImovelDados.get('/imovel-dados/:tipo/:id', async (req, res) => {
  try {
    const alvo = lerAlvo(req);
    if ('erro' in alvo) return erro(res, 400, 'REG360_PARAMS_INVALIDOS', alvo.erro);
    // Imóvel sem registro é caso NORMAL, não 404: a maioria nunca foi editada.
    res.json(await buscarDados(req, alvo.imovelId, alvo.imovelTipo) ?? {});
  } catch (err: any) {
    erro(res, 500, 'REG360_BUSCAR_FALHOU', err?.message || 'Falha ao buscar dados do imóvel');
  }
});

// POST /api/reg360/imovel-dados/:tipo/:id/preco-estatico — grava UMA VEZ
rotasImovelDados.post('/imovel-dados/:tipo/:id/preco-estatico', async (req, res) => {
  try {
    if (!podeCriar(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem gravar o preço de contrato');
    }
    const alvo = lerAlvo(req);
    if ('erro' in alvo) return erro(res, 400, 'REG360_PARAMS_INVALIDOS', alvo.erro);

    const preco = precoValido(req.body?.preco_estatico);
    if (preco !== null && typeof preco === 'object') return erro(res, 400, 'REG360_DADOS_INVALIDOS', preco.erro);
    if (preco === null) return erro(res, 400, 'REG360_DADOS_INVALIDOS', 'preco_estatico é obrigatório');

    const atual = await buscarDados(req, alvo.imovelId, alvo.imovelTipo);
    // Já gravado é 409, não sobrescrita silenciosa. É a razão de existir do
    // campo: não perder o valor real de um contrato firmado.
    if (atual && atual.preco_estatico !== null && atual.preco_estatico !== undefined) {
      return erro(res, 409, 'REG360_PRECO_ESTATICO_GRAVADO',
        'O preço de contrato deste imóvel já está gravado. Corrigi-lo exige admin da app.');
    }

    const salvo = await salvar(req, alvo.imovelId, alvo.imovelTipo, {
      preco_estatico: preco,
      preco_estatico_em: hojeISO(),
      preco_estatico_por_id: req.contexto?.usuario?.id ?? null,
    });
    res.json(salvo);
  } catch (err: any) {
    erro(res, 422, 'REG360_SALVAR_FALHOU', err?.message || 'Falha ao gravar preço de contrato');
  }
});

// POST /api/reg360/imovel-dados/:tipo/:id/preco-estatico/corrigir — só admin
rotasImovelDados.post('/imovel-dados/:tipo/:id/preco-estatico/corrigir', async (req, res) => {
  try {
    // A assimetria É o ponto: quem grava não corrige. `criador` e
    // `validador_interno` não passam aqui.
    if (!ehAdmin(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas admin da app pode corrigir um preço de contrato já gravado');
    }
    const alvo = lerAlvo(req);
    if ('erro' in alvo) return erro(res, 400, 'REG360_PARAMS_INVALIDOS', alvo.erro);

    const preco = precoValido(req.body?.preco_estatico);
    if (preco !== null && typeof preco === 'object') return erro(res, 400, 'REG360_DADOS_INVALIDOS', preco.erro);

    const salvo = await salvar(req, alvo.imovelId, alvo.imovelTipo, {
      preco_estatico: preco,
      preco_estatico_em: preco === null ? null : hojeISO(),
      preco_estatico_por_id: preco === null ? null : (req.contexto?.usuario?.id ?? null),
    });
    res.json(salvo);
  } catch (err: any) {
    erro(res, 422, 'REG360_SALVAR_FALHOU', err?.message || 'Falha ao corrigir preço de contrato');
  }
});

// PUT /api/reg360/imovel-dados/:tipo/:id/preco-manual — definir ou limpar
rotasImovelDados.put('/imovel-dados/:tipo/:id/preco-manual', async (req, res) => {
  try {
    if (!podeCriar(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem definir o preço manual');
    }
    const alvo = lerAlvo(req);
    if ('erro' in alvo) return erro(res, 400, 'REG360_PARAMS_INVALIDOS', alvo.erro);

    // Corpo que tenta escrever `quitado` ou `preco_estatico` por aqui é
    // recusado, não ignorado: rota descritiva não pula gate de rota dedicada.
    const limpo = semCamposProtegidos(req.body || {});
    if ('erro' in limpo) return erro(res, 400, 'REG360_CAMPO_PROTEGIDO', limpo.erro);

    const preco = precoValido(req.body?.preco_m2_manual);
    if (preco !== null && typeof preco === 'object') return erro(res, 400, 'REG360_DADOS_INVALIDOS', preco.erro);

    // `null` é intenção legítima: limpar o override e voltar para a cascata.
    const salvo = await salvar(req, alvo.imovelId, alvo.imovelTipo, { preco_m2_manual: preco });
    res.json(salvo);
  } catch (err: any) {
    erro(res, 422, 'REG360_SALVAR_FALHOU', err?.message || 'Falha ao salvar preço manual');
  }
});

/**
 * PUT /api/reg360/imovel-dados/:tipo/:id — dados descritivos: `uso` e
 * `observacao` (issue #20).
 *
 * `tipo_lote` não é aceito aqui, de propósito: é sempre derivado do Uso
 * (`tipoLoteDeUso()`, em `comum/catalogos.ts`), nunca gravado — gravar os dois
 * seria uma segunda fonte da verdade dentro do próprio app.
 *
 * As duas guardas, na ordem certa: `apenasEditaveisImovel` filtra o corpo para
 * só os campos que esta rota entende (o que sobra fora é ignorado, não é
 * ataque); `semCamposProtegidos` roda ANTES sobre o corpo bruto, porque ela
 * precisa ver `preco_estatico`/`quitado` para recusar — depois do pick da
 * allowlist eles já teriam sumido, e a recusa explícita (400) viraria descarte
 * silencioso, que é exatamente o que a #20 pede para não acontecer.
 */
rotasImovelDados.put('/imovel-dados/:tipo/:id', async (req, res) => {
  try {
    if (!podeCriar(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem editar os dados do imóvel');
    }
    const alvo = lerAlvo(req);
    if ('erro' in alvo) return erro(res, 400, 'REG360_PARAMS_INVALIDOS', alvo.erro);

    const protegido = semCamposProtegidos(req.body || {});
    if ('erro' in protegido) return erro(res, 400, 'REG360_CAMPO_PROTEGIDO', protegido.erro);

    const campos = apenasEditaveisImovel(req.body);
    const salvo = await salvar(req, alvo.imovelId, alvo.imovelTipo, campos);
    res.json(salvo);
  } catch (err: any) {
    erro(res, 422, 'REG360_SALVAR_FALHOU', err?.message || 'Falha ao salvar dados do imóvel');
  }
});

// ---------------------------------------------------------------------------
// Quitação
// ---------------------------------------------------------------------------
//
// Marca, não cálculo. O saldo devedor vive na base do financeiro, fora do
// escopo do app: aqui se registra que alguém CONSTATOU a quitação — e por isso
// quem e quando são gravados junto. Marca sem autoria não responde a única
// pergunta que alguém vai fazer depois: "quem disse que estava quitado?".
//
// Rota dedicada, separada do PUT descritivo: quitação não é campo que se edita
// de passagem no mesmo formulário do resto.

async function alternarQuitacao(req: any, res: any, quitar: boolean) {
  try {
    if (!podeQuitar(req)) {
      return erro(res, 403, 'SEM_PERMISSAO',
        'Apenas validadores internos podem registrar quitação');
    }
    const alvo = lerAlvo(req);
    if ('erro' in alvo) return erro(res, 400, 'REG360_PARAMS_INVALIDOS', alvo.erro);

    const atual = await buscarDados(req, alvo.imovelId, alvo.imovelTipo);
    const jaEsta = Boolean(atual?.quitado) === quitar;
    // Idempotente de propósito: repetir a ação não é conflito, é o mesmo
    // desfecho. 409 aqui só faria a tela tratar erro que não é erro.
    if (jaEsta) {
      return res.json({ ...(atual ?? {}), ok: true, [quitar ? 'ja_quitado' : 'ja_nao_quitado']: true });
    }

    // Desmarcar limpa autoria e data junto: deixá-las apontando para a
    // marcação anterior faria a tela dizer "quitado por Fulano" sobre um imóvel
    // que não está quitado.
    const salvo = await salvar(req, alvo.imovelId, alvo.imovelTipo, {
      quitado: quitar,
      quitado_em: quitar ? hojeISO() : null,
      quitado_por_id: quitar ? (req.contexto?.usuario?.id ?? null) : null,
    });
    res.json({ ...(salvo ?? {}), ok: true });
  } catch (err: any) {
    erro(res, 422, 'REG360_SALVAR_FALHOU', err?.message || 'Falha ao registrar quitação');
  }
}

// POST /api/reg360/imovel-dados/:tipo/:id/quitar
rotasImovelDados.post('/imovel-dados/:tipo/:id/quitar', (req, res) => alternarQuitacao(req, res, true));

// POST /api/reg360/imovel-dados/:tipo/:id/desquitar
//
// Existe porque marca irreversível vira dado errado permanente no primeiro
// clique por engano — e ninguém confia numa marca que não dá para desfazer.
rotasImovelDados.post('/imovel-dados/:tipo/:id/desquitar', (req, res) => alternarQuitacao(req, res, false));
