/**
 * Catálogo de **Uso** e **Tipo de Lote** — fonte única de rótulo, cor e família
 * de piso.
 *
 * ## A decisão que este arquivo registra: texto livre, não `opcoes`
 *
 * A issue #22 pedia uma lista fechada. Ela **não pôde ser fechada**: o único
 * valor de Uso que se sabe existir é `CSIIR`, lido do badge azul da tela do
 * legado, e **ninguém levantou o que a sigla significa** nem qual é o resto da
 * lista. Tipo de Lote aparece vazio (`—`) em todas as capturas.
 *
 * Diante disso, a própria #22 previa o caminho: *"Se a lista não puder ser
 * fechada agora, decidir explicitamente por texto livre com sugestões em vez de
 * `opcoes` — e escrever o porquê, em vez de chutar um enum."* É o que está
 * decidido aqui, e o porquê é este:
 *
 * **Enum provisório é dívida silenciosa.** Uma coluna com `opcoes` recusa valor
 * fora da lista, então cada valor novo do Planilhão viraria migração — sobre
 * uma base com ~6.233 lotes já importados. E um enum chutado tem um defeito
 * pior que o custo: ele *parece* conhecimento. Quem lê `opcoes: ['CSIIR', ...]`
 * assume que alguém levantou a lista, e a suposição some dentro do schema.
 *
 * **Texto livre com catálogo por cima** separa as duas coisas. A coluna aceita
 * o que vier; este arquivo diz o que sabemos sobre cada valor. Acrescentar um
 * valor é editar este arquivo — um commit, sem migração.
 *
 * ## O que NÃO é livre: a família de piso
 *
 * `comum/preco.ts` precisa saber se um uso é `residencial` ou
 * `comercial_misto` para escolher entre `preco_minimo_residencial` e
 * `preco_minimo_comercial_misto`. Sem isso, `respeitaPiso` recebe `null` e
 * devolve `{ piso: null, abaixoDoPiso: false }` — que na tela é
 * **indistinguível de "respeita o piso"**.
 *
 * Ou seja: uso sem família não deixa a checagem imprecisa, deixa a checagem
 * **desligada, com cara de aprovação**. Por isso `familia` é campo obrigatório
 * da entrada e aceita `null` explícito — `null` significa *"não levantado"*, e
 * `usosSemFamilia` existe para a tela poder dizer isso em voz alta em vez de
 * deixar passar. Mesmo princípio de `tiposDesconhecidos` em
 * `transacoes-contrato.ts`: o descarte é legítimo, o silêncio não.
 *
 * ## Onde o dado mora — questão aberta, e de propósito
 *
 * Este catálogo é **agnóstico a onde `uso` é gravado**. A decisão registrada na
 * #38 é que o destino é o objeto Lote do Núcleo, não uma tabela desta app — e
 * o payload do Lote ainda não traz o campo (conferido contra o SDK 52). Por
 * isso #19, #20 e #21 estão paradas.
 *
 * Nada disso impede o catálogo de existir: rótulo, cor e família são
 * conhecimento sobre o *valor*, não sobre a *coluna*. Quando o dado aparecer,
 * seja de onde for, é daqui que a tela lê.
 */

import type { FamiliaPiso } from './preco.js';
import type { CorBadge } from './acoes.js';

export type { FamiliaPiso };

/**
 * O que se sabe sobre um valor de Uso.
 *
 * `origem` não é enfeite: é o que permite ao revisor julgar se a entrada ainda
 * vale. Uma lista de exceção mantida à mão só se sustenta se cada entrada disser
 * de onde veio.
 */
export interface EntradaCatalogo {
  /** O valor como ele chega do dado. Comparação é exata, nunca por substring. */
  valor: string;
  /** Rótulo humano para a tela. */
  rotulo: string;
  /** Cor do badge. Mapa exato — classificar por substring faz um valor vestir o badge do outro. */
  cor: CorBadge;
  /**
   * Família de piso, ou `null` quando **não foi levantada**.
   *
   * `null` não é "não se aplica": é dívida conhecida. Ver `usosSemFamilia`.
   */
  familia: FamiliaPiso | null;
  /** De onde este valor veio, para o próximo revisor julgar se ainda vale. */
  origem: string;
}

/**
 * Catálogo de Uso.
 *
 * **Uma entrada só, e ela é a pergunta em aberto.** `CSIIR` é o único valor
 * observado — no badge azul da tela do legado —, e o significado da sigla nunca
 * foi levantado. Ele está aqui em vez de fora porque o valor **existe no dado
 * real**: omiti-lo faria a tela tratá-lo como desconhecido sem registrar que
 * sabemos da existência dele e não do sentido.
 *
 * A família fica `null` de propósito. Chutar entre residencial e
 * comercial/misto decidiria, em massa, se milhares de lotes respeitam o piso —
 * e o erro seria invisível, porque um piso checado contra a família errada
 * responde com a mesma confiança de um certo.
 */
export const CATALOGO_USO: readonly EntradaCatalogo[] = [
  {
    valor: 'CSIIR',
    rotulo: 'CSIIR',
    cor: 'info',
    familia: null,
    origem: 'Badge azul da tela do legado (issue #22). Significado da sigla não levantado.',
  },
];

/**
 * Catálogo de Tipo de Lote — **vazio, e isso é um fato registrado**.
 *
 * O campo aparece na tela do legado sempre como `—` em todas as capturas. Não
 * há um único valor observado. Um catálogo vazio diz isso; um catálogo
 * inventado diria que alguém levantou.
 */
export const CATALOGO_TIPO_LOTE: readonly EntradaCatalogo[] = [];

function acharEntrada(catalogo: readonly EntradaCatalogo[], valor: unknown): EntradaCatalogo | null {
  const alvo = String(valor ?? '').trim();
  if (!alvo) return null;
  return catalogo.find((e) => e.valor === alvo) ?? null;
}

/** A entrada de um valor de Uso, ou `null` se o catálogo não o conhece. */
export function entradaDeUso(valor: unknown): EntradaCatalogo | null {
  return acharEntrada(CATALOGO_USO, valor);
}

/** A entrada de um valor de Tipo de Lote, ou `null`. */
export function entradaDeTipoLote(valor: unknown): EntradaCatalogo | null {
  return acharEntrada(CATALOGO_TIPO_LOTE, valor);
}

/**
 * Rótulo para a tela.
 *
 * Valor desconhecido **volta como veio**, não como `—` nem vazio. É a mesma
 * regra do vínculo que não resolve (`#123` à mostra): dado que existe e que não
 * sabemos interpretar tem de aparecer, senão ninguém descobre que ele existe.
 */
export function rotuloDeUso(valor: unknown): string | null {
  const bruto = String(valor ?? '').trim();
  if (!bruto) return null;
  return entradaDeUso(bruto)?.rotulo ?? bruto;
}

/** Cor do badge de Uso. Valor fora do catálogo fica neutro, nunca colorido por chute. */
export function corDeUso(valor: unknown): CorBadge {
  return entradaDeUso(valor)?.cor ?? 'padrao';
}

/**
 * A família de piso de um uso, para `respeitaPiso`.
 *
 * Devolve `null` para uso desconhecido **e** para uso conhecido cuja família
 * não foi levantada — os dois casos têm a mesma consequência prática (a
 * checagem de piso não roda) e nenhum deve ser confundido com "está abaixo" ou
 * "está acima".
 */
export function familiaDoUso(valor: unknown): FamiliaPiso | null {
  return entradaDeUso(valor)?.familia ?? null;
}

/**
 * Os usos presentes no dado cuja família de piso não é conhecida.
 *
 * **É a contrapartida do `null` silencioso**, no mesmo espírito de
 * `tiposDesconhecidos`. Sem isto, um uso sem família faz `respeitaPiso`
 * devolver `abaixoDoPiso: false` — e a tela mostra o mesmo que mostraria para
 * um preço que respeita o piso de verdade. A checagem estaria desligada, e
 * nada diria.
 *
 * Inclui tanto o uso fora do catálogo quanto o que está nele com
 * `familia: null` — para quem lê a tela, os dois significam "o piso não foi
 * conferido para este imóvel".
 */
export function usosSemFamilia(valores: readonly unknown[]): string[] {
  const vistos = new Set<string>();
  for (const v of valores || []) {
    const bruto = String(v ?? '').trim();
    if (!bruto) continue;
    if (familiaDoUso(bruto) !== null) continue;
    vistos.add(bruto);
  }
  return [...vistos].sort();
}

/**
 * Sugestões para um campo de texto livre — o "com sugestões" da decisão.
 *
 * Não é allowlist: quem digitar fora da lista **é aceito**. Serve para o valor
 * já conhecido ser digitado igual, em vez de virar `CSIIR`, `csiir` e `C.S.I.I.R.`
 * como três usos diferentes.
 */
export function sugestoesDeUso(): string[] {
  return CATALOGO_USO.map((e) => e.valor);
}

/** Idem, para Tipo de Lote. Vazio enquanto nenhum valor tiver sido observado. */
export function sugestoesDeTipoLote(): string[] {
  return CATALOGO_TIPO_LOTE.map((e) => e.valor);
}
