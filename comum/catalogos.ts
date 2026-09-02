/**
 * Catálogo de **Uso** e **Tipo de Lote** — fonte única de rótulo, cor e família
 * de piso.
 *
 * ## A decisão que este arquivo registra: texto livre, não `opcoes`
 *
 * A issue #22 pedia uma lista fechada. Ela **não pôde ser fechada**: `CSIIR` —
 * lido do badge azul da tela do legado — é o único valor de Uso **observado**,
 * e observado não é o mesmo que único. Nada garante que não haja outros na
 * base. Tipo de Lote aparece vazio (`—`) em todas as capturas, sem um único
 * valor conhecido.
 *
 * O significado do `CSIIR` e a família dele **foram levantados** (ver o
 * catálogo abaixo); o que continua aberto é se a lista tem mais valores.
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
 * deixar passar. Hoje nenhuma entrada está com `null`, mas a guarda continua
 * valendo para todo valor que chegar do dado e não estiver aqui. Mesmo princípio de `tiposDesconhecidos` em
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
  /** Rótulo humano para a tela. Curto — é o que cabe num badge de tabela. */
  rotulo: string;
  /**
   * O que a sigla significa, por extenso.
   *
   * Opcional porque valor autoexplicativo não precisa. Mas **sigla sem
   * expansão registrada em lugar nenhum era metade do problema da #22**: o
   * badge dizia `CSIIR` e ninguém no projeto sabia o que era. Onde houver
   * sigla, isto é obrigatório na prática.
   */
  descricao?: string;
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
 * **Uma entrada, e ela está completa.** `CSIIR` é o único valor observado — no
 * badge azul da tela do legado —, e o significado foi levantado com o Ricardo:
 * *Comercial, Serviços, Industrial, Institucional e Residencial*. É uma
 * categoria de **uso misto**, e é o próprio Ricardo quem a classifica como
 * `comercial_misto` para efeito de piso.
 *
 * A sigla incluir "Residencial" no final não a torna residencial: uso misto
 * admite residência entre outros usos, e o piso que se aplica é o do conjunto.
 * A família não foi derivada da leitura da sigla — foi respondida por quem
 * define o piso.
 *
 * **Uma entrada não significa lista fechada.** Nada garante que este seja o
 * único valor de Uso na base; ele é o único **observado**. Valor que aparecer
 * fora daqui é aceito (a coluna é texto livre) e cai em `usosSemFamilia`, onde
 * fica visível em vez de desligar a checagem de piso em silêncio.
 */
export const CATALOGO_USO: readonly EntradaCatalogo[] = [
  {
    valor: 'CSIIR',
    rotulo: 'CSIIR',
    descricao: 'Comercial, Serviços, Industrial, Institucional e Residencial',
    cor: 'info',
    familia: 'comercial_misto',
    origem: 'Badge azul da tela do legado. Significado e família respondidos pelo Ricardo na issue #22.',
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

/**
 * O significado por extenso, quando há. `null` para valor sem sigla a expandir
 * — e para valor desconhecido, que é justamente o caso em que não sabemos.
 */
export function descricaoDeUso(valor: unknown): string | null {
  return entradaDeUso(valor)?.descricao ?? null;
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
