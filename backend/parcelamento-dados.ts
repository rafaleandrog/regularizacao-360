import { Router } from 'express';
import { soData } from '../comum/cascata.js';
import { proximaPagina } from '../comum/paginacao.js';
import { upsertPorChave } from './upsert.js';
import {
  faseRegularizacao,
  apenasEditaveisParcelamento,
  SITUACOES_REGISTRAIS,
} from '../comum/regularizacao.js';

/**
 * Rotas de `parcelamento_dados` — os campos de regularização que o Núcleo não
 * tem e não vai ter (o monorepo é somente leitura para este trabalho).
 *
 * A tabela é `acesso_externo: "restrito"`, então todo acesso passa por aqui.
 * O gate de escrita é o role `editor_regularizacao`, que existe no manifesto
 * desde o começo e até agora não tinha nenhum uso no código.
 */

const NUMEROS = ['area_poligonal', 'area_viario', 'area_servidao'] as const;
const DATAS = ['data_envio_projeto', 'data_aprovacao_conplan', 'data_decreto_gdf'] as const;
const SITUACOES = new Set(SITUACOES_REGISTRAIS.map((s) => s.id));
/** Teto de cliente do framework de dados. Pedir mais devolve fatia, sem erro. */
const POR_PAGINA = 100;

function erro(res: any, status: number, codigo: string, mensagem: string) {
  return res.status(status).json({ erro: true, codigo, mensagem });
}

function podeEditarRegularizacao(req: any): boolean {
  const ctx = req.contexto;
  return ctx?.nivelApp === 'admin' || (ctx?.rolesApp || []).includes('editor_regularizacao');
}

/** Acrescenta a fase derivada — a tela não recalcula o que o backend já sabe. */
function comFase(registro: any) {
  if (!registro) return registro;
  return { ...registro, fase_regularizacao: faseRegularizacao(registro) };
}

/**
 * Valida e normaliza o corpo. Data é validada como dia de calendário REAL e
 * gravada como string `YYYY-MM-DD` — nunca via `new Date()`, que o driver
 * re-trunca no fuso da sessão e desloca o dia.
 */
function prepararCorpo(body: any): Record<string, unknown> | { erro: string } {
  const dados = apenasEditaveisParcelamento(body);

  for (const campo of NUMEROS) {
    const v = dados[campo];
    if (v === undefined || v === null) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return { erro: `${campo} deve ser número >= 0 ou null` };
    dados[campo] = n;
  }

  for (const campo of DATAS) {
    const v = dados[campo];
    if (v === undefined || v === null || v === '') {
      if (v === '' ) dados[campo] = null;
      continue;
    }
    const iso = soData(v);
    // `soData` só extrai o prefixo; conferir que é dia real (2026-02-30 não é).
    if (!iso || !diaDeCalendarioValido(iso)) {
      return { erro: `${campo} deve ser uma data YYYY-MM-DD válida` };
    }
    dados[campo] = iso;
  }

  if (dados.matricula_id !== undefined && dados.matricula_id !== null) {
    const n = Number(dados.matricula_id);
    if (!Number.isInteger(n) || n < 1) return { erro: 'matricula_id deve ser inteiro positivo ou null' };
    dados.matricula_id = n;
  }

  if (dados.situacao_registral !== undefined) {
    const v = String(dados.situacao_registral ?? 'nenhuma').trim().toLowerCase();
    if (!SITUACOES.has(v)) {
      return { erro: `situacao_registral inválida (válidas: ${[...SITUACOES].join(', ')})` };
    }
    dados.situacao_registral = v;
  }

  if (typeof dados.numero_decreto === 'string' && dados.numero_decreto.length > 100) {
    return { erro: 'numero_decreto até 100 caracteres' };
  }

  return dados;
}

/** `2026-02-30` casa o formato mas não existe — o round-trip revela. */
function diaDeCalendarioValido(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export const rotasParcelamentoDados: ReturnType<typeof Router> = Router();

// GET /api/reg360/parcelamento-dados — todos, para os chips de fase e os cards.
// Existe porque a lista tem 60 parcelamentos: sem ele, a tela faria 60 chamadas.
rotasParcelamentoDados.get('/parcelamento-dados', async (req, res) => {
  try {
    const filtros: Record<string, unknown> = {};
    if (req.query.parcelamento_id) filtros.parcelamento_id = Number(req.query.parcelamento_id);

    // Pagina em laço em vez de pedir uma página grande: `listar` tem teto de
    // cliente e devolve uma FATIA sem erro quando se pede mais. Com 60
    // parcelamentos caberia numa página hoje — mas o dia em que não couber, a
    // lista truncaria calada, e esse é o defeito que não se vê.
    //
    // O verbo `varrerTudo` existe para isto no framework, mas NÃO no SDK
    // publicado que esta app compila contra (ver CLAUDE.md § piso de
    // plataforma). Quando o `sdk_min` subir (issue #4), este laço vira uma
    // linha.
    //
    // A resposta do framework de dados tem a mesma forma paginada do Núcleo,
    // então a decisão de quando parar é a mesma — reusada de comum/paginacao.
    const acumulado: Record<string, any>[] = [];
    let pagina: number | null = 1;
    while (pagina !== null) {
      const resposta: any = await req.dados!.listar('parcelamento_dados', {
        filtros,
        pagina,
        por_pagina: POR_PAGINA,
      });
      acumulado.push(...(resposta?.dados || []));
      pagina = proximaPagina(resposta, pagina, acumulado.length);
    }
    res.json({ dados: acumulado.map(comFase) });
  } catch (err: any) {
    erro(res, 500, 'REG360_LISTAR_FALHOU', err?.message || 'Falha ao listar dados de regularização');
  }
});

// PUT /api/reg360/parcelamento-dados/:parcelamentoId — upsert (role editor_regularizacao)
rotasParcelamentoDados.put('/parcelamento-dados/:parcelamentoId', async (req, res) => {
  try {
    if (!podeEditarRegularizacao(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas editores de regularização podem alterar estes campos');
    }
    const parcelamentoId = Number(req.params.parcelamentoId);
    if (!Number.isInteger(parcelamentoId) || parcelamentoId < 1) {
      return erro(res, 400, 'REG360_PARAMS_INVALIDOS', 'parcelamentoId deve ser inteiro positivo');
    }

    const preparado = prepararCorpo(req.body);
    if ('erro' in preparado && typeof preparado.erro === 'string') {
      return erro(res, 400, 'REG360_DADOS_INVALIDOS', preparado.erro);
    }
    const dados = preparado as Record<string, unknown>;
    dados.atualizado_por_id = req.contexto?.usuario?.id ?? null;

    // O registro nasce na primeira edição. `upsertPorChave` trata a corrida:
    // transação sozinha NÃO fecha a janela, porque SELECT não trava linha
    // inexistente — ver o comentário em `backend/upsert.ts`.
    const salvo = await upsertPorChave(req.dados!, {
      tabela: 'parcelamento_dados',
      chave: { parcelamento_id: parcelamentoId },
      dados,
    });

    if (!salvo) {
      return erro(res, 404, 'REG360_NAO_ENCONTRADA', 'Registro de regularização não encontrado');
    }
    res.json(comFase(salvo));
  } catch (err: any) {
    erro(res, 422, 'REG360_SALVAR_FALHOU', err?.message || 'Falha ao salvar dados de regularização');
  }
});
