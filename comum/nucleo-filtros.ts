/**
 * O que o Núcleo aceita como recorte — e a conferência de que ele obedeceu.
 *
 * Existe por uma assimetria que falha **calada**. No Núcleo, `lerFiltrosExatos`
 * itera sobre a allowlist da entidade, não sobre a query string:
 *
 * ```ts
 * for (const campo of camposFiltro) {
 *   const bruto = query[campo];
 *   if (bruto === undefined) continue;
 * ```
 *
 * Um parâmetro fora da allowlist **nunca chega ao SQL**. Não há erro, não há
 * aviso: a listagem volta *sem aquele recorte* — com MAIS linhas, nunca com
 * menos. Por isso o sintoma de filtro ignorado não é tela vazia; é tela cheia
 * de dado que não é do recorte pedido, com cara de resposta certa.
 *
 * Foi assim que a v0.1.1 pediu `unidades?parcelamento_id=N` — filtro que não
 * existe — e teria recebido as unidades da instância inteira como se fossem
 * daquele parcelamento.
 *
 * O importador já se defende disso na escrita (`casaComChave`, em
 * `scripts/importar-planilhao.mjs`). Aqui é a mesma ideia na leitura.
 */

/**
 * Filtros de igualdade que cada recurso do Núcleo honra.
 *
 * **Conferido em 2026-08-29** contra os objetos `OPCOES_*` de
 * `nucleo/backend/src/rotas/*.ts` no monorepo. É retrato de um instante: se o
 * Núcleo mudar, esta tabela mente até alguém reconferir — daí a data escrita.
 *
 * Só os recursos que a app lista. Recurso ausente daqui é recusado por
 * `conferirFiltros`, de propósito: acrescentar entidade obriga a olhar a
 * allowlist dela, em vez de mandar filtro e torcer.
 */
export const FILTROS_NUCLEO: Record<string, readonly string[]> = {
  parcelamentos: ['setor_habitacional_id'],
  lotes: ['parcelamento_id', 'incorporacao_id', 'matricula_id'],
  unidades: ['incorporacao_id', 'matricula_id'],
  glebas: ['matricula_id'],
  'setores-habitacionais': [],
  matriculas: [],
  incorporacoes: [],
  // `pessoas` não passa pela fábrica de handlers: a rota é escrita à mão e
  // aceita só `tipo` além de `busca`/`removido`.
  pessoas: ['tipo'],
};

/**
 * Parâmetros que valem em qualquer recurso e **não** são recorte por coluna:
 * paginação, busca textual (ILIKE sobre `camposBusca`) e o filtro de
 * soft-delete. Não passam pela allowlist e não se conferem contra a linha.
 */
export const PARAMS_NAO_FILTRO: ReadonlySet<string> = new Set([
  'pagina',
  'por_pagina',
  'busca',
  'removido',
]);

/** Falha de contrato entre a app e o Núcleo. Não é erro de rede nem de dado. */
export class ErroDeFiltro extends Error {
  readonly codigo = 'FILTRO_NAO_SUPORTADO';
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeFiltro';
  }
}

/** Só as chaves que valem como recorte — descarta vazio e os `PARAMS_NAO_FILTRO`. */
function camposDeRecorte(filtros: Record<string, unknown> | undefined): string[] {
  return Object.entries(filtros || {})
    .filter(([k, v]) => !PARAMS_NAO_FILTRO.has(k) && v !== undefined && v !== null && v !== '')
    .map(([k]) => k);
}

/**
 * Os filtros pedidos que este recurso **não** honra. Vazio = todos honrados.
 *
 * Recurso desconhecido devolve todos os campos de recorte: sem allowlist não há
 * como afirmar que o Núcleo obedece, e afirmar sem saber é o defeito que este
 * módulo existe para matar.
 */
export function filtrosNaoSuportados(
  recurso: string,
  filtros?: Record<string, unknown>,
): string[] {
  const aceitos = FILTROS_NUCLEO[recurso];
  const pedidos = camposDeRecorte(filtros);
  if (!aceitos) return pedidos;
  return pedidos.filter((c) => !aceitos.includes(c));
}

/**
 * Barra a requisição antes de sair. Falha alto em vez de deixar o Núcleo
 * devolver a lista inteira — pedir recorte que não existe é bug da app, e bug
 * que vira dado plausível não é encontrado.
 */
export function conferirFiltros(recurso: string, filtros?: Record<string, unknown>): void {
  const sobrando = filtrosNaoSuportados(recurso, filtros);
  if (sobrando.length === 0) return;
  const conhecido = FILTROS_NUCLEO[recurso];
  const aceita = conhecido
    ? conhecido.length
      ? `aceita ${conhecido.join(', ')}`
      : 'não aceita filtro nenhum'
    : 'não está na tabela de filtros conhecidos (comum/nucleo-filtros.ts)';
  throw new ErroDeFiltro(
    `GET /${recurso} ${aceita} — ${sobrando.join(', ')} seria ignorado em silêncio ` +
      'e a resposta viria sem o recorte, com dado a mais.',
  );
}

/**
 * Quantas linhas devolvidas **não** casam com o recorte pedido.
 *
 * Um campo só é conferível quando vem no payload da linha; `parcelamentos`
 * devolve `setor_habitacional_id` e `lotes` devolve `parcelamento_id`,
 * `incorporacao_id` e `matricula_id`, todos por `selectAll`. Campo que não vem
 * na linha é **pulado** — não dá para conferir o que não se enxerga, e chutar
 * que está certo seria repetir o problema noutro lugar.
 *
 * Comparação por texto: o Núcleo devolve id como número e a query string leva
 * string; `String(3) === String('3')` evita um falso positivo bobo.
 */
export function linhasForaDoFiltro(
  filtros: Record<string, unknown> | undefined,
  linhas: readonly unknown[],
): number {
  const campos = camposDeRecorte(filtros);
  if (campos.length === 0) return 0;
  let fora = 0;
  for (const linha of linhas) {
    const reg = linha as Record<string, unknown> | null;
    if (!reg || typeof reg !== 'object') continue;
    for (const campo of campos) {
      if (!(campo in reg)) continue;
      if (String(reg[campo] ?? '') !== String(filtros![campo])) {
        fora += 1;
        break;
      }
    }
  }
  return fora;
}

/**
 * As linhas de uma página, recusando envelope que não é envelope.
 *
 * `resposta?.dados || []` tratava resposta de forma desconhecida como **vazia**
 * — se o Núcleo trocar o envelope, a app diz "não tem dado" em vez de "não
 * entendi a resposta", e a diferença some. Página legitimamente vazia tem
 * `dados: []`, que é array e passa.
 */
export function linhasDaPagina<T>(resposta: unknown, recurso: string): T[] {
  const dados = (resposta as { dados?: unknown } | null | undefined)?.dados;
  if (!Array.isArray(dados)) {
    throw new ErroDeFiltro(
      `GET /${recurso} devolveu um envelope sem a lista \`dados\` — ` +
        'o formato da resposta do Núcleo mudou, ou a rota não é de listagem.',
    );
  }
  return dados as T[];
}
