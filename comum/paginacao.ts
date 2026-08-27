/**
 * Lógica pura de varredura paginada do Núcleo (reg360).
 *
 * Existe porque o Núcleo pagina em no máximo 200 registros e **não** tem
 * equivalente ao `varrerTudo` do framework de dados: quem precisa do conjunto
 * inteiro pagina em laço até a página vir incompleta. E precisamos do conjunto
 * inteiro porque `req.nucleo` (backend) não lê — só `batch`, `chamarSubrecurso`,
 * `atualizar` e `buscarPorChave` — então toda agregação (contagem de lotes,
 * área, VGV) acontece no cliente.
 *
 * Sem dependência de Express, Lit ou `fetch`: só a decisão de quando parar.
 */

/** Teto do Núcleo. Pedir acima disso é clampeado sem erro, não rejeitado. */
export const POR_PAGINA_NUCLEO = 200;

/**
 * Guarda contra laço infinito: se o servidor devolver páginas cheias para
 * sempre (bug, ou filtro que o Núcleo ignora), a varredura para aqui em vez de
 * rodar até o navegador morrer. 200 páginas × 200 = 40.000 registros, folgado
 * para os ~6.200 lotes da instância.
 */
export const TETO_PAGINAS = 200;

export interface PaginaNucleo<T = unknown> {
  dados?: T[];
  total?: number;
  pagina?: number;
  por_pagina?: number;
  paginas?: number;
}

function numeroFinito(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Número da próxima página a pedir, ou `null` quando a varredura terminou.
 *
 * Quatro sinais de fim, checados nesta ordem — o Núcleo devolve `total` e
 * `paginas`, mas nem todo endpoint preenche os dois, então nenhum sozinho
 * serve de critério:
 *
 * 1. página vazia;
 * 2. `pagina >= paginas`;
 * 3. `total` conhecido e já acumulado;
 * 4. página incompleta (menos linhas que `por_pagina`) — a última.
 */
export function proximaPagina(
  resposta: PaginaNucleo,
  paginaPedida: number,
  acumulado: number,
): number | null {
  const linhas = Array.isArray(resposta?.dados) ? resposta.dados.length : 0;
  if (linhas === 0) return null;

  const paginas = numeroFinito(resposta?.paginas);
  if (paginas !== null && paginaPedida >= paginas) return null;

  const total = numeroFinito(resposta?.total);
  if (total !== null && acumulado >= total) return null;

  const porPagina = numeroFinito(resposta?.por_pagina);
  if (porPagina !== null && porPagina > 0 && linhas < porPagina) return null;

  if (paginaPedida >= TETO_PAGINAS) return null;
  return paginaPedida + 1;
}

/**
 * Chave de cache estável para (recurso, filtros). Ordena as chaves para que
 * `{a:1,b:2}` e `{b:2,a:1}` não virem duas entradas do mesmo conjunto, e
 * descarta valor vazio — `undefined`, `null` e `''` não viram filtro na query
 * string, então também não podem separar cache.
 */
export function chaveCache(recurso: string, filtros?: Record<string, unknown>): string {
  const limpo: Record<string, string> = {};
  for (const [k, v] of Object.entries(filtros || {})) {
    if (v !== undefined && v !== null && v !== '') limpo[k] = String(v);
  }
  const ordenado = Object.keys(limpo)
    .sort()
    .map((k) => `${k}=${limpo[k]}`)
    .join('&');
  return ordenado ? `${recurso}?${ordenado}` : recurso;
}
