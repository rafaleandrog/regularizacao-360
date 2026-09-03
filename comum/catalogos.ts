/**
 * Catálogo de **Uso** e **Tipo de Lote** — fonte única de rótulo, cor e família
 * de piso.
 *
 * ## A decisão que este arquivo registra: texto livre, não `opcoes`
 *
 * A issue #22 pediu uma lista fechada. Na abertura, só `CSIIR` — lido do badge
 * azul da tela do legado — era valor **observado**, e observado não era o
 * mesmo que único. O Ricardo respondeu as duas perguntas pendentes: a lista de
 * Uso tem seis valores (`CSIIR`, `INST`, `RE`, `RE 2`, `RE 3`, `RO`, todos no
 * catálogo abaixo), e Tipo de Lote **não é um campo próprio do legado** — é
 * `Residencial` ou `Comercial`, **derivado** do Uso cadastrado no lote. Ver
 * `tipoLoteDeUso()`.
 *
 * A escolha de texto livre (em vez de `opcoes`) permanece mesmo com a lista
 * fechada, pelo motivo abaixo — fechar a lista **hoje** não é garantia contra
 * um valor novo aparecer numa importação futura do Planilhão, e o texto livre
 * é o que faz esse caso ser "aceito e visível" em vez de "rejeitado na
 * gravação". É o caminho que a própria #22 previa: *"Se a lista não puder ser
 * fechada agora, decidir explicitamente por texto livre com sugestões em vez de
 * `opcoes` — e escrever o porquê, em vez de chutar um enum."*
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
 * Catálogo de Uso — **lista fechada, os seis valores respondidos pelo
 * Ricardo na issue #22** (2026-09-03).
 *
 * `CSIIR` é uso **misto**: a sigla termina em "Residencial", mas isso não a
 * torna residencial — ela admite residência entre outros usos, e o piso que
 * se aplica é o do conjunto. Por isso `comercial_misto`, não `residencial`. A
 * família de cada entrada não foi derivada da leitura da sigla — foi
 * respondida por quem define o piso, a mesma régua que já valia para `CSIIR`
 * antes desta lista fechar: `RE`, `RE 2`, `RE 3` e `RO` são uso
 * exclusivamente residencial (`residencial`). `INST` (institucional) não foi
 * classificado ao pé da letra pelo Ricardo — é dedução a partir da própria
 * regra que ele deu: só há dois baldes possíveis (Residencial ou Comercial),
 * `RE`/`RE 2`/`RE 3`/`RO` batem residencial pelo nome, e o que sobra —
 * `CSIIR` e `INST` — cai em `comercial_misto` por eliminação, não por leitura
 * da sigla.
 *
 * A coluna continua **texto livre** (ver o comentário do arquivo): a lista
 * fechar hoje não impede um valor novo de aparecer numa importação futura, e
 * o que "fechada" garante é que estes seis têm significado, cor e família
 * conhecidos — não que nenhum outro vá aparecer. Valor fora daqui continua
 * aceito e cai em `usosSemFamilia`, visível em vez de desligar a checagem de
 * piso em silêncio.
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
  {
    valor: 'INST',
    rotulo: 'INST',
    descricao: 'Institucional',
    cor: 'info',
    familia: 'comercial_misto',
    origem: 'Significado respondido pelo Ricardo na issue #22 (2026-09-03). Família (comercial_misto) é dedução por eliminação a partir da regra dele — não resposta literal para este valor específico.',
  },
  {
    valor: 'RE',
    rotulo: 'RE',
    descricao: 'Residencial Exclusivo',
    cor: 'sucesso',
    familia: 'residencial',
    origem: 'Significado e família respondidos pelo Ricardo na issue #22 (2026-09-03).',
  },
  {
    valor: 'RE 2',
    rotulo: 'RE 2',
    descricao: 'Residencial Exclusivo 2',
    cor: 'sucesso',
    familia: 'residencial',
    origem: 'Significado e família respondidos pelo Ricardo na issue #22 (2026-09-03). Formato exato do valor (com espaço) como recebido — reconferir contra a base se algum dia aparecer sem casar.',
  },
  {
    valor: 'RE 3',
    rotulo: 'RE 3',
    descricao: 'Residencial Exclusivo 3',
    cor: 'sucesso',
    familia: 'residencial',
    origem: 'Significado e família respondidos pelo Ricardo na issue #22 (2026-09-03). Formato exato do valor (com espaço) como recebido — reconferir contra a base se algum dia aparecer sem casar.',
  },
  {
    valor: 'RO',
    rotulo: 'RO',
    descricao: 'Residencial Obrigatório',
    cor: 'sucesso',
    familia: 'residencial',
    origem: 'Significado e família respondidos pelo Ricardo na issue #22 (2026-09-03).',
  },
];

/**
 * Catálogo de Tipo de Lote — **os dois valores que o campo pode assumir,
 * porque ele é derivado, não capturado**.
 *
 * A pergunta original da #22 ("Tipo de Lote tem algum valor?") tinha uma
 * premissa errada: o campo aparecia sempre `—` no legado não porque estivesse
 * morto, mas porque **não existe como dado próprio** — o Ricardo respondeu que
 * Tipo de Lote é sempre `Residencial` ou `Comercial`, calculado a partir do
 * Uso cadastrado no lote (ver `tipoLoteDeUso()`). Por isso a lista fecha em
 * exatamente dois valores, e nenhum dos dois vem de uma coluna do legado.
 *
 * Estas entradas existem para dar rótulo e cor ao valor **já derivado** —
 * quando a tela um dia exibir Tipo de Lote (issues #19/#20/#21, hoje paradas
 * porque nem `uso` nem `tipo_lote` chegam no payload do Lote do Núcleo), ela
 * não deve remontar rótulo/cor na mão.
 */
export const CATALOGO_TIPO_LOTE: readonly EntradaCatalogo[] = [
  {
    valor: 'Residencial',
    rotulo: 'Residencial',
    cor: 'sucesso',
    familia: 'residencial',
    origem: 'Derivado de familiaDoUso() === "residencial", por decisão do Ricardo na issue #22 (2026-09-03) — ver tipoLoteDeUso().',
  },
  {
    valor: 'Comercial',
    rotulo: 'Comercial',
    cor: 'info',
    familia: 'comercial_misto',
    origem: 'Derivado de familiaDoUso() === "comercial_misto", por decisão do Ricardo na issue #22 (2026-09-03) — ver tipoLoteDeUso().',
  },
];

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
 * Tipo de Lote **derivado** de um valor de Uso — `Residencial`, `Comercial`,
 * ou `null` quando o Uso não é conhecido (ou é conhecido e sem família
 * levantada).
 *
 * Não existe coluna de Tipo de Lote no legado: o campo é sempre calculado a
 * partir do Uso, por decisão do Ricardo na #22. A função só traduz o mesmo
 * `FamiliaPiso` que `familiaDoUso()` já resolve — `residencial` vira
 * `'Residencial'`, `comercial_misto` vira `'Comercial'` — para não haver dois
 * lugares decidindo a mesma família com nomes diferentes.
 */
export function tipoLoteDeUso(valorDeUso: unknown): string | null {
  const familia = familiaDoUso(valorDeUso);
  if (familia === 'residencial') return 'Residencial';
  if (familia === 'comercial_misto') return 'Comercial';
  return null;
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

/**
 * Idem, para Tipo de Lote — `['Residencial', 'Comercial']`, os dois únicos
 * valores possíveis, já que o campo é sempre derivado (ver `tipoLoteDeUso()`).
 */
export function sugestoesDeTipoLote(): string[] {
  return CATALOGO_TIPO_LOTE.map((e) => e.valor);
}
