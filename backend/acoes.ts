import { Router } from 'express';
import { proximaPagina, lerPaginacao } from '../comum/paginacao.js';
import { mapaComLimite } from '../comum/concorrencia.js';
import {
  apenasEditaveisAcao,
  lerVinculosImovel,
  lerVinculosPessoa,
  lerFiltroImovel,
  ehTipoAcao,
  ehPolo,
  ehStatusAcao,
  TIPOS_ACAO,
  POLOS,
  STATUS_ACAO,
} from '../comum/acoes.js';

/**
 * Rotas de Ações judiciais — `acoes`, `acao_imoveis` e `acao_pessoas`.
 *
 * As três tabelas são `acesso_externo: "restrito"`, então todo acesso passa por
 * aqui. O gate de escrita é `criador` (ou admin da app); leitura é livre para
 * qualquer nível — quem enxerga o lote precisa saber que há litígio sobre ele.
 *
 * **A referência aos objetos do Núcleo é lógica, e é assim de propósito.** O
 * backend não lê o Núcleo (`req.nucleo` não tem `listar` nem `buscar`), então
 * não há como conferir se o `imovel_id` existe antes de gravar. Um id que não
 * resolve aparece na tela como vínculo pendente, com o número à mostra — e é a
 * tela que precisa aguentar isso sem quebrar.
 */

const POR_PAGINA = 100;
/** Simultâneos ao buscar vínculos ação a ação — mesma razão de `comum/concorrencia.ts`. */
const JANELA_VINCULOS = 6;

function erro(res: any, status: number, codigo: string, mensagem: string) {
  return res.status(status).json({ erro: true, codigo, mensagem });
}

function podeEscrever(req: any): boolean {
  const ctx = req.contexto;
  return ctx?.nivelApp === 'admin' || (ctx?.rolesApp || []).includes('criador');
}

/**
 * Ordem única da listagem de ações, aplicada nos DOIS caminhos.
 *
 * A rota pagina de dois jeitos — no banco quando não há filtro de vínculo, em
 * memória quando há —, e ordem que muda conforme o filtro aplicado é o tipo de
 * inconsistência que o usuário nota e ninguém consegue reproduzir.
 */
const ORDEM_ACOES = { ordenar: 'data', ordem: 'desc' } as const;

/** Varre uma tabela do app inteira, paginando — `listar` devolve fatia. */
async function varrer(
  req: any,
  tabela: string,
  filtros: Record<string, unknown>,
  ordem: Record<string, unknown> = {},
) {
  const acumulado: Record<string, any>[] = [];
  let pagina: number | null = 1;
  while (pagina !== null) {
    const resposta: any = await req.dados!.listar(tabela, {
      filtros, ...ordem, pagina, por_pagina: POR_PAGINA,
    });
    acumulado.push(...(resposta?.dados || []));
    pagina = proximaPagina(resposta, pagina, acumulado.length);
  }
  return acumulado;
}

/**
 * Vínculos de uma lista de ações.
 *
 * O framework de dados **não filtra por lista de ids**, então buscar os
 * vínculos de N ações é um dilema entre N requisições e uma varredura da
 * tabela. A escolha depende de N, e é por isso que ela é feita aqui e não
 * fixada de um jeito só:
 *
 * - **uma ação** (o detalhe, e o retorno de criar/editar) → filtro por
 *   `acao_id`, que é o índice da tabela. Varrer as duas tabelas inteiras para
 *   montar UMA ação é o desperdício óbvio, e era o que esta função fazia.
 * - **poucas ações** → uma requisição por ação, em janela de simultâneos.
 * - **muitas ações** → uma varredura só, e o filtro em memória: aí a varredura
 *   custa menos que a enxurrada de requisições.
 */
const ACOES_ATE_QUE_VALE_UMA_A_UMA = 10;

async function vinculosDe(req: any, acoes: any[]) {
  if (acoes.length === 0) return { imoveis: new Map<number, any[]>(), pessoas: new Map<number, any[]>() };

  const ids = acoes.map((a) => Number(a.id));
  const buscar = async (tabela: string) => {
    if (ids.length <= ACOES_ATE_QUE_VALE_UMA_A_UMA) {
      const porLote = await mapaComLimite(ids, JANELA_VINCULOS, (id) =>
        varrer(req, tabela, { acao_id: id }));
      return porLote.flat();
    }
    return varrer(req, tabela, {});
  };

  const [imoveis, pessoas] = await Promise.all([buscar('acao_imoveis'), buscar('acao_pessoas')]);
  const conhecidos = new Set(ids);
  const porAcao = (lista: any[]) => {
    const m = new Map<number, any[]>();
    for (const v of lista) {
      const id = Number(v.acao_id);
      if (!conhecidos.has(id)) continue;
      const atual = m.get(id);
      if (atual) atual.push(v);
      else m.set(id, [v]);
    }
    return m;
  };
  return { imoveis: porAcao(imoveis), pessoas: porAcao(pessoas) };
}

function comVinculos(acao: any, imoveis: Map<number, any[]>, pessoas: Map<number, any[]>) {
  const id = Number(acao?.id);
  return { ...acao, imoveis: imoveis.get(id) || [], pessoas: pessoas.get(id) || [] };
}

/**
 * Valida e normaliza o corpo de criação/edição.
 *
 * `tipo`, `polo` e `status` são checados contra as listas de `comum/acoes.ts` —
 * um lugar só. O schema também as declara em `opcoes`, mas errar aqui devolveria
 * um erro de banco em vez de uma mensagem que diz o que fazer.
 */
function prepararCorpo(body: any, { exigirObrigatorios }: { exigirObrigatorios: boolean }) {
  const dados = apenasEditaveisAcao(body);

  if (exigirObrigatorios) {
    if (dados.tipo === undefined) return { erro: 'tipo é obrigatório' };
    if (dados.polo === undefined) return { erro: 'polo é obrigatório' };
  }
  if (dados.tipo !== undefined && !ehTipoAcao(dados.tipo)) {
    return { erro: `tipo precisa ser um de: ${TIPOS_ACAO.join(', ')}` };
  }
  if (dados.polo !== undefined && !ehPolo(dados.polo)) {
    return { erro: `polo precisa ser um de: ${POLOS.join(', ')}` };
  }
  if (dados.status !== undefined && !ehStatusAcao(dados.status)) {
    return { erro: `status precisa ser um de: ${STATUS_ACAO.join(', ')}` };
  }

  if (dados.valor !== undefined && dados.valor !== null && dados.valor !== '') {
    const n = Number(dados.valor);
    if (!Number.isFinite(n) || n < 0) return { erro: 'valor deve ser número >= 0 ou null' };
    dados.valor = n;
  } else if (dados.valor === '') {
    dados.valor = null;
  }

  // Data como string `YYYY-MM-DD`, nunca `new Date()`: o driver re-trunca no
  // fuso da sessão e desloca o dia.
  if (dados.data !== undefined) {
    if (dados.data === null || dados.data === '') dados.data = null;
    else {
      const m = String(dados.data).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return { erro: 'data precisa estar em YYYY-MM-DD' };
      const [, a, mes, dia] = m;
      const d = new Date(`${a}-${mes}-${dia}T00:00:00Z`);
      const real = d.getUTCFullYear() === Number(a)
        && d.getUTCMonth() + 1 === Number(mes)
        && d.getUTCDate() === Number(dia);
      if (!real) return { erro: 'data não é um dia de calendário válido' };
      dados.data = `${a}-${mes}-${dia}`;
    }
  }

  return dados;
}

export const rotasAcoes: ReturnType<typeof Router> = Router();

// GET /api/reg360/acoes — listar, com filtros
rotasAcoes.get('/acoes', async (req, res) => {
  try {
    const filtroImovel = lerFiltroImovel(req.query as any);
    if ('erro' in filtroImovel) return erro(res, 400, 'REG360_PARAMS_INVALIDOS', filtroImovel.erro);

    const filtros: Record<string, unknown> = {};
    if (req.query.tipo) filtros.tipo = String(req.query.tipo);
    if (req.query.polo) filtros.polo = String(req.query.polo);
    if (req.query.status) filtros.status = String(req.query.status);

    const { pagina, porPagina } = lerPaginacao(req.query as any, { padrao: POR_PAGINA, max: POR_PAGINA });

    // Filtrar por imóvel ou por pessoa é filtrar pela TABELA DE VÍNCULO, e o
    // framework não faz junção entre tabelas do app. O caminho é: achar os
    // acao_id do vínculo, e então listar as ações por id. Como uma ação tem
    // poucos vínculos e um imóvel tem poucas ações, o custo é baixo.
    let idsPorVinculo: Set<number> | null = null;
    if ('filtro' in filtroImovel && filtroImovel.filtro) {
      const vinculos = await varrer(req, 'acao_imoveis', filtroImovel.filtro as any);
      idsPorVinculo = new Set(vinculos.map((v) => Number(v.acao_id)));
    }
    if (req.query.pessoa_id) {
      const pessoaId = Number(req.query.pessoa_id);
      if (!Number.isInteger(pessoaId) || pessoaId < 1) {
        return erro(res, 400, 'REG360_PARAMS_INVALIDOS', 'pessoa_id inválido');
      }
      const vinculos = await varrer(req, 'acao_pessoas', { pessoa_id: pessoaId });
      const ids = new Set(vinculos.map((v) => Number(v.acao_id)));
      // Dois filtros de vínculo juntos são interseção: "ações deste lote E
      // desta pessoa". União devolveria ações que não têm nada com o lote.
      idsPorVinculo = idsPorVinculo === null
        ? ids
        : new Set([...idsPorVinculo].filter((id) => ids.has(id)));
    }

    if (idsPorVinculo !== null && idsPorVinculo.size === 0) {
      return res.json({ dados: [], total: 0, pagina, por_pagina: porPagina, paginas: 1 });
    }

    // SEM filtro de vínculo, a paginação é do banco: pedir a página e pronto.
    // A varredura só existe porque o filtro de vínculo mora noutra tabela e o
    // framework não faz junção — usá-la sempre faria toda listagem carregar a
    // tabela inteira para devolver 100 linhas.
    if (idsPorVinculo === null) {
      const r: any = await req.dados!.listar('acoes', {
        filtros, ...ORDEM_ACOES, pagina, por_pagina: porPagina,
      });
      const linhas = r?.dados || [];
      const { imoveis, pessoas } = await vinculosDe(req, linhas);
      return res.json({ ...r, dados: linhas.map((a: any) => comVinculos(a, imoveis, pessoas)) });
    }

    const todas = await varrer(req, 'acoes', filtros, ORDEM_ACOES);
    const filtradas = todas.filter((a) => idsPorVinculo!.has(Number(a.id)));

    const inicio = (pagina - 1) * porPagina;
    const fatia = filtradas.slice(inicio, inicio + porPagina);
    const { imoveis, pessoas } = await vinculosDe(req, fatia);

    // Paginação calculada aqui, e não ecoada do banco: a fatia saiu de um
    // filtro que o banco não aplicou, então `total` e `paginas` dele contariam
    // as ações que o vínculo excluiu.
    res.json({
      dados: fatia.map((a) => comVinculos(a, imoveis, pessoas)),
      total: filtradas.length,
      pagina,
      por_pagina: porPagina,
      paginas: Math.max(1, Math.ceil(filtradas.length / porPagina)),
    });
  } catch (err: any) {
    erro(res, 500, 'REG360_LISTAR_FALHOU', err?.message || 'Falha ao listar ações');
  }
});

// GET /api/reg360/acoes/:id — detalhe com os vínculos
rotasAcoes.get('/acoes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return erro(res, 400, 'REG360_PARAMS_INVALIDOS', 'id inválido');
    const acao = await req.dados!.buscar('acoes', id);
    if (!acao) return erro(res, 404, 'REG360_NAO_ENCONTRADO', 'Ação não encontrada');
    const { imoveis, pessoas } = await vinculosDe(req, [acao]);
    res.json(comVinculos(acao, imoveis, pessoas));
  } catch (err: any) {
    erro(res, 500, 'REG360_BUSCAR_FALHOU', err?.message || 'Falha ao buscar ação');
  }
});

// POST /api/reg360/acoes — criar a ação JUNTO com os vínculos (role criador)
//
// O corpo traz `imoveis[]` e `pessoas[]`, e tudo grava numa transação. Criar a
// ação e vincular depois, em chamadas separadas, deixa ação órfã quando a
// segunda falha: consistência multi-tabela é do endpoint, nunca do chamador.
rotasAcoes.post('/acoes', async (req, res) => {
  try {
    if (!podeEscrever(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem registrar ações');
    }
    const preparado = prepararCorpo(req.body, { exigirObrigatorios: true });
    if ('erro' in preparado) return erro(res, 400, 'REG360_DADOS_INVALIDOS', preparado.erro as string);

    const imoveis = lerVinculosImovel(req.body?.imoveis);
    if ('erro' in imoveis) return erro(res, 400, 'REG360_DADOS_INVALIDOS', imoveis.erro);
    const pessoas = lerVinculosPessoa(req.body?.pessoas);
    if ('erro' in pessoas) return erro(res, 400, 'REG360_DADOS_INVALIDOS', pessoas.erro);

    // Ação sobre nada não é ação — e uma ação sem vínculo nenhum não aparece em
    // tela alguma, então nasceria invisível.
    if (imoveis.vinculos.length === 0 && pessoas.vinculos.length === 0) {
      return erro(res, 400, 'REG360_DADOS_INVALIDOS',
        'A ação precisa de ao menos um imóvel ou uma pessoa vinculada');
    }

    const dados = preparado as Record<string, unknown>;
    dados.criado_por_id = req.contexto?.usuario?.id ?? null;

    const criada = await req.dados!.transaction(async (trx: any) => {
      const acao = await trx.criar('acoes', dados);
      const acaoId = Number(acao.id);
      for (const v of imoveis.vinculos) await trx.criar('acao_imoveis', { ...v, acao_id: acaoId });
      for (const v of pessoas.vinculos) await trx.criar('acao_pessoas', { ...v, acao_id: acaoId });
      return acao;
    });

    const { imoveis: iv, pessoas: pv } = await vinculosDe(req, [criada]);
    res.status(201).json(comVinculos(criada, iv, pv));
  } catch (err: any) {
    erro(res, 500, 'REG360_CRIAR_FALHOU', err?.message || 'Falha ao criar ação');
  }
});

// PATCH /api/reg360/acoes/:id — editar (role criador)
rotasAcoes.patch('/acoes/:id', async (req, res) => {
  try {
    if (!podeEscrever(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem editar ações');
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return erro(res, 400, 'REG360_PARAMS_INVALIDOS', 'id inválido');

    const preparado = prepararCorpo(req.body, { exigirObrigatorios: false });
    if ('erro' in preparado) return erro(res, 400, 'REG360_DADOS_INVALIDOS', preparado.erro as string);

    const atualizada = await req.dados!.atualizar('acoes', id, preparado as Record<string, unknown>);
    if (!atualizada) return erro(res, 404, 'REG360_NAO_ENCONTRADO', 'Ação não encontrada');
    const { imoveis, pessoas } = await vinculosDe(req, [atualizada]);
    res.json(comVinculos(atualizada, imoveis, pessoas));
  } catch (err: any) {
    erro(res, 500, 'REG360_ATUALIZAR_FALHOU', err?.message || 'Falha ao atualizar ação');
  }
});

// POST /api/reg360/acoes/:id/remover — soft delete (role criador)
rotasAcoes.post('/acoes/:id/remover', async (req, res) => {
  try {
    if (!podeEscrever(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem remover ações');
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return erro(res, 400, 'REG360_PARAMS_INVALIDOS', 'id inválido');
    const atual = await req.dados!.buscar('acoes', id);
    if (!atual) return erro(res, 404, 'REG360_NAO_ENCONTRADO', 'Ação não encontrada');

    // Os vínculos saem junto: vínculo órfão apontando para ação removida
    // reapareceria em qualquer contagem por imóvel ou por pessoa.
    await req.dados!.transaction(async (trx: any) => {
      const { dados: vi } = await trx.listar('acao_imoveis', { filtros: { acao_id: id }, por_pagina: POR_PAGINA });
      for (const v of vi || []) await trx.deletar('acao_imoveis', Number(v.id));
      const { dados: vp } = await trx.listar('acao_pessoas', { filtros: { acao_id: id }, por_pagina: POR_PAGINA });
      for (const v of vp || []) await trx.deletar('acao_pessoas', Number(v.id));
      await trx.deletar('acoes', id);
    });
    res.json({ removida: true, id });
  } catch (err: any) {
    erro(res, 500, 'REG360_REMOVER_FALHOU', err?.message || 'Falha ao remover ação');
  }
});

// POST /api/reg360/acoes/:id/imoveis — vincular imóvel (role criador)
rotasAcoes.post('/acoes/:id/imoveis', async (req, res) => {
  await vincular(req, res, 'acao_imoveis', () => lerVinculosImovel([req.body]));
});

// POST /api/reg360/acoes/:id/pessoas — vincular pessoa (role criador)
rotasAcoes.post('/acoes/:id/pessoas', async (req, res) => {
  await vincular(req, res, 'acao_pessoas', () => lerVinculosPessoa([req.body]));
});

async function vincular(
  req: any,
  res: any,
  tabela: string,
  ler: () => { vinculos: any[] } | { erro: string },
) {
  try {
    if (!podeEscrever(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem vincular');
    }
    const acaoId = Number(req.params.id);
    if (!Number.isInteger(acaoId)) return erro(res, 400, 'REG360_PARAMS_INVALIDOS', 'id inválido');
    const acao = await req.dados!.buscar('acoes', acaoId);
    if (!acao) return erro(res, 404, 'REG360_NAO_ENCONTRADO', 'Ação não encontrada');

    const lido = ler();
    if ('erro' in lido) return erro(res, 400, 'REG360_DADOS_INVALIDOS', lido.erro);
    const vinculo = lido.vinculos[0];
    if (!vinculo) return erro(res, 400, 'REG360_DADOS_INVALIDOS', 'Vínculo vazio');

    const { dados: existentes } = await req.dados!.listar(tabela, {
      filtros: { ...vinculo, acao_id: acaoId },
      por_pagina: 1,
    });
    // Vincular o que já está vinculado é ruído do chamador, não conflito: a
    // resposta é o vínculo que já existe, e a tela não precisa tratar erro.
    if (existentes?.[0]) return res.json(existentes[0]);

    const criado = await req.dados!.criar(tabela, { ...vinculo, acao_id: acaoId });
    res.status(201).json(criado);
  } catch (err: any) {
    erro(res, 500, 'REG360_VINCULAR_FALHOU', err?.message || 'Falha ao vincular');
  }
}

// POST /api/reg360/acoes/:id/imoveis/:vinculoId/remover
rotasAcoes.post('/acoes/:id/imoveis/:vinculoId/remover', async (req, res) => {
  await desvincular(req, res, 'acao_imoveis');
});

// POST /api/reg360/acoes/:id/pessoas/:vinculoId/remover
rotasAcoes.post('/acoes/:id/pessoas/:vinculoId/remover', async (req, res) => {
  await desvincular(req, res, 'acao_pessoas');
});

async function desvincular(req: any, res: any, tabela: string) {
  try {
    if (!podeEscrever(req)) {
      return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem desvincular');
    }
    const acaoId = Number(req.params.id);
    const vinculoId = Number(req.params.vinculoId);
    if (!Number.isInteger(acaoId) || !Number.isInteger(vinculoId)) {
      return erro(res, 400, 'REG360_PARAMS_INVALIDOS', 'id inválido');
    }
    const vinculo = await req.dados!.buscar(tabela, vinculoId);
    // Conferir que o vínculo é DESTA ação: sem isso, quem conhece um id
    // qualquer apaga vínculo de outra ação por uma URL montada à mão.
    if (!vinculo || Number(vinculo.acao_id) !== acaoId) {
      return erro(res, 404, 'REG360_NAO_ENCONTRADO', 'Vínculo não encontrado nesta ação');
    }
    await req.dados!.deletar(tabela, vinculoId);
    res.json({ removido: true, id: vinculoId });
  } catch (err: any) {
    erro(res, 500, 'REG360_DESVINCULAR_FALHOU', err?.message || 'Falha ao desvincular');
  }
}
