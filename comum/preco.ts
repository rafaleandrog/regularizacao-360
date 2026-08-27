/**
 * Preço aplicável e valor do imóvel (reg360).
 *
 * A precedência sai dos números das próprias telas do legado:
 *
 * | Lote | Proposta vigente | Estático | Final | Área | Valor exibido |
 * |---|---|---|---|---|---|
 * | `B Lote 1`  | 300,00 | — | — | 1.008,85 | 302.655,00 = 300,00 × 1.008,85 |
 * | `BS Lote 1` | 190,00 | 200,00 | 161,10 | 194,82 | 31.385,99 = **161,10** × 194,82 |
 *
 * O segundo caso é o que fixa a regra: onde há preço final, ele SOBREPÕE a
 * proposta vigente. E o valor é sempre `preço aplicável × área`.
 *
 * Puro: sem Express, sem Lit, sem fetch.
 */

export type OrigemPreco = 'estatico' | 'manual' | 'proposta' | null;

export interface PrecoAplicavel {
  valor: number | null;
  origem: OrigemPreco;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * O preço por m² que vale para o imóvel, e **de onde ele veio**.
 *
 * A origem é parte do retorno, não detalhe: três preços na tela sem dizer qual
 * está valendo é exatamente o que faz alguém "corrigir uma fórmula por engano"
 * — o risco que o preço estático existe para evitar.
 *
 * Precedência:
 * 1. `preco_estatico` — contrato firmado, gravado uma vez e imutável.
 * 2. `preco_m2_manual` — override digitado, sem ser contrato.
 * 3. preço da proposta vigente, resolvido em cascata.
 *
 * **Zero é valor legítimo** e vence os seguintes: um contrato de R$ 0,00 é um
 * fato, não um campo vazio.
 */
export function precoAplicavel(imovelDados: any, propostaVigente: any): PrecoAplicavel {
  const estatico = numero(imovelDados?.preco_estatico);
  if (estatico !== null) return { valor: estatico, origem: 'estatico' };

  const manual = numero(imovelDados?.preco_m2_manual);
  if (manual !== null) return { valor: manual, origem: 'manual' };

  const daProposta = numero(propostaVigente?.preco_m2);
  if (daProposta !== null) return { valor: daProposta, origem: 'proposta' };

  return { valor: null, origem: null };
}

/**
 * Valor do imóvel = preço aplicável × área efetiva.
 *
 * `null` — nunca `0` — quando falta preço ou área. Zero é um valor legítimo, e
 * confundi-lo com ausência produz VGV mentiroso: some a diferença entre "vale
 * nada" e "não sabemos quanto vale".
 */
export function valorDoImovel(preco: number | null, areaEfetiva: unknown): number | null {
  const area = numero(areaEfetiva);
  if (preco === null || area === null) return null;
  return preco * area;
}

// ---------------------------------------------------------------------------
// Descontos da proposta
// ---------------------------------------------------------------------------

export type FormaPagamento = 'a_vista' | '6x' | '12x';

const CAMPO_DESCONTO: Record<FormaPagamento, string> = {
  a_vista: 'desconto_a_vista',
  '6x': 'desconto_6x',
  '12x': 'desconto_12x',
};

/**
 * Preço por m² depois dos descontos da proposta.
 *
 * Os campos `desconto_a_vista`, `desconto_6x`, `desconto_12x`,
 * `desconto_lote_grande` e `lote_grande_m2` existem no schema desde o primeiro
 * commit e **nunca apareceram em tela nenhuma** — API sem UI é feature
 * invisível. Aqui viram cálculo exibível.
 *
 * Os percentuais são acumulativos e aplicados em sequência sobre o preço: o
 * desconto de lote grande soma-se ao da forma de pagamento.
 */
export function aplicarDescontos(
  preco: number | null,
  proposta: any,
  forma: FormaPagamento,
  areaEfetiva?: unknown,
): number | null {
  if (preco === null) return null;
  let resultado = preco;

  const pctForma = numero(proposta?.[CAMPO_DESCONTO[forma]]);
  if (pctForma !== null) resultado = resultado * (1 - pctForma / 100);

  const area = numero(areaEfetiva);
  const minimoLoteGrande = numero(proposta?.lote_grande_m2);
  const pctLoteGrande = numero(proposta?.desconto_lote_grande);
  if (area !== null && minimoLoteGrande !== null && pctLoteGrande !== null && area >= minimoLoteGrande) {
    resultado = resultado * (1 - pctLoteGrande / 100);
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Pisos
// ---------------------------------------------------------------------------

export type FamiliaPiso = 'residencial' | 'comercial_misto';

export interface ResultadoPiso {
  /** `null` quando não há piso declarado, ou a família do uso é desconhecida. */
  piso: number | null;
  abaixoDoPiso: boolean;
}

/**
 * O preço respeita o piso da proposta para aquela família de uso?
 *
 * **Informativo, nunca bloqueio** (RN-06): devolve o diagnóstico e quem chama
 * decide alertar. Negociação abaixo do piso é decisão de negócio, não erro.
 *
 * `familia` vem do catálogo de Uso (issue #22). Enquanto o catálogo não existe,
 * o chamador passa `null` e a checagem não roda — melhor não checar do que
 * checar contra a família errada.
 */
export function respeitaPiso(
  preco: number | null,
  proposta: any,
  familia: FamiliaPiso | null,
): ResultadoPiso {
  if (preco === null || !familia) return { piso: null, abaixoDoPiso: false };
  const campo = familia === 'residencial' ? 'preco_minimo_residencial' : 'preco_minimo_comercial_misto';
  const piso = numero(proposta?.[campo]);
  if (piso === null) return { piso: null, abaixoDoPiso: false };
  return { piso, abaixoDoPiso: preco < piso };
}
