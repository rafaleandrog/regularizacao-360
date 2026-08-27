import { urbiVerso, type ErroApi } from './reg360-env.js';
import {
  proximaPagina,
  chaveCache,
  POR_PAGINA_NUCLEO,
  type PaginaNucleo,
} from '../comum/paginacao.js';

/**
 * Cliente de leitura do Núcleo.
 *
 * Toda leitura do Núcleo é daqui, e não de `urbiVerso.nucleo` espalhado pelas
 * telas, por três razões que se somam:
 *
 * 1. **O backend não lê o Núcleo.** `req.nucleo` só expõe `batch`,
 *    `chamarSubrecurso`, `atualizar` e `buscarPorChave` — não há `listar`.
 *    Então contagem, soma de área e VGV são agregados aqui.
 * 2. **O Núcleo pagina em 200** e não tem `varrerTudo`. Varrer os ~6.200 lotes
 *    são 32 requisições; sem cache, cada troca de aba refaz todas.
 * 3. **Flag desligada é 403, não lista vazia.** Sem tratamento, a tela mostra
 *    "nenhum registro" quando na verdade o admin não liberou o acesso.
 */

// ---------------------------------------------------------------------------
// Erros de flag de Núcleo
// ---------------------------------------------------------------------------

/**
 * Os dois 403 do gate de flags do Núcleo. São causas opostas e o remédio muda:
 * - `NUCLEO_FLAG_DESLIGADA` — o admin da instância não ligou o toggle em
 *   `Admin → Apps → reg360 → Núcleo`. É operação.
 * - `NUCLEO_FLAG_NAO_PEDIDA` — o manifesto não declara a flag. É bug da app.
 */
const CODIGOS_FLAG = new Set(['NUCLEO_FLAG_DESLIGADA', 'NUCLEO_FLAG_NAO_PEDIDA']);

export interface FalhaDeFlag {
  codigo: string;
  /** Mensagem do Núcleo — já nomeia a entidade e a flag que falta. */
  mensagem: string;
  /** true quando é o admin que precisa agir; false quando é bug do manifesto. */
  precisaDeAdmin: boolean;
}

/**
 * O shell já normaliza o erro de API (`status`, `codigo`, `mensagem`) em
 * `requisitarApi` — não reimplementamos parsing de corpo aqui.
 */
export function falhaDeFlag(erro: unknown): FalhaDeFlag | null {
  const e = erro as ErroApi | undefined;
  const codigo = e?.codigo;
  if (!codigo || !CODIGOS_FLAG.has(codigo)) return null;
  return {
    codigo,
    mensagem: e?.message || 'Acesso ao Núcleo negado',
    precisaDeAdmin: codigo === 'NUCLEO_FLAG_DESLIGADA',
  };
}

// ---------------------------------------------------------------------------
// Cache de sessão
// ---------------------------------------------------------------------------

/**
 * Guarda a **promessa**, não o resultado: duas telas que pedem o mesmo conjunto
 * ao mesmo tempo compartilham uma requisição em vez de disparar duas. Promessa
 * rejeitada é removida, para que o erro não fique memorizado.
 */
const cache = new Map<string, Promise<unknown>>();

function memorizar<T>(chave: string, produzir: () => Promise<T>): Promise<T> {
  const guardado = cache.get(chave) as Promise<T> | undefined;
  if (guardado) return guardado;
  const p = produzir().catch((e) => {
    cache.delete(chave);
    throw e;
  });
  cache.set(chave, p);
  return p;
}

/** Invalida o cache de um recurso (todas as combinações de filtro) ou tudo. */
export function invalidar(recurso?: string): void {
  if (!recurso) {
    cache.clear();
    return;
  }
  for (const chave of [...cache.keys()]) {
    if (chave === recurso || chave.startsWith(`${recurso}?`)) cache.delete(chave);
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

function comQuery(recurso: string, params: Record<string, unknown>): string {
  const limpo: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') limpo[k] = String(v);
  }
  const qs = new URLSearchParams(limpo).toString();
  return `/${recurso}${qs ? `?${qs}` : ''}`;
}

/** Uma página. Para tabela que pagina na tela e não precisa do conjunto todo. */
export function listarPagina<T = any>(
  recurso: string,
  filtros: Record<string, unknown> = {},
  pagina = 1,
  porPagina = POR_PAGINA_NUCLEO,
): Promise<PaginaNucleo<T>> {
  const chave = chaveCache(recurso, { ...filtros, pagina, por_pagina: porPagina });
  return memorizar(chave, () =>
    urbiVerso.nucleo(comQuery(recurso, { ...filtros, pagina, por_pagina: porPagina })),
  );
}

/**
 * O conjunto inteiro, paginando em laço até a varredura acabar
 * (ver `comum/paginacao.ts` para os critérios de parada).
 */
export function listarTudo<T = any>(
  recurso: string,
  filtros: Record<string, unknown> = {},
): Promise<T[]> {
  return memorizar(chaveCache(recurso, filtros), async () => {
    const acumulado: T[] = [];
    let pagina: number | null = 1;
    while (pagina !== null) {
      const resposta: PaginaNucleo<T> = await urbiVerso.nucleo(
        comQuery(recurso, { ...filtros, pagina, por_pagina: POR_PAGINA_NUCLEO }),
      );
      acumulado.push(...(resposta?.dados || []));
      pagina = proximaPagina(resposta, pagina, acumulado.length);
    }
    return acumulado;
  });
}

/** Detalhe por id. */
export function buscar<T = any>(recurso: string, id: number): Promise<T> {
  return memorizar(`${recurso}/${id}`, () => urbiVerso.nucleo(`/${recurso}/${id}`));
}

/**
 * Sub-recurso de um registro — hoje só `\/lotes\/:id\/pessoas`.
 *
 * É por id, um de cada vez, porque o Núcleo **não expõe** `imovel_pessoas` em
 * lote: não há expansão de vínculo na listagem de lotes, nem na de imóveis, nem
 * filtro por lista de ids. Mostrar quem ocupa cada lote numa tabela custa uma
 * requisição por linha — daí o cache aqui e o limite de concorrência em
 * `comum/concorrencia.ts` de quem chama.
 */
export function listarSubRecurso<T = any>(
  recurso: string,
  id: number,
  sub: string,
): Promise<T[]> {
  return memorizar(`${recurso}/${id}/${sub}`, async () => {
    const resposta: PaginaNucleo<T> = await urbiVerso.nucleo(`/${recurso}/${id}/${sub}`);
    return resposta?.dados || [];
  });
}
