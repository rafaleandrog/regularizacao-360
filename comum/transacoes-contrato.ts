/**
 * Contrato de Transação (reg360) — o formato que o app espera, num lugar só.
 *
 * **A entidade Transação ainda não existe no Núcleo.** Este arquivo não é
 * antecipação gratuita: sem ele, o formato dela vazaria por costuras espalhadas
 * — uma rota `501` aqui, um `dot` codificado no template ali —, e ligar a
 * Transação depois viraria caçar referências em vez de trocar um adaptador.
 *
 * O interruptor é `DISPONIVEL`. Trocá-lo para `true` não deve exigir mexer em
 * tela nenhuma: só ligar o adaptador ao Núcleo.
 */

/** O interruptor. Enquanto for `false`, o app diz o que falta em vez de errar. */
export const DISPONIVEL = false;

/** Os quatro tipos do negócio. É catálogo — a ordem daqui não significa nada. */
export const TIPOS_TRANSACAO = [
  'pre_contrato',
  'promessa_compra_venda',
  'cessao',
  'escritura',
] as const;

export type TipoTransacao = (typeof TIPOS_TRANSACAO)[number];

/**
 * Quão avançado é cada tipo. **Mapa explícito, não posição numa lista.**
 *
 * Derivar o estágio da ordem do array acopla uma regra de negócio à ordem de
 * escrita de uma constante: reordenar por estética mudaria o badge de todo
 * imóvel, em silêncio. Aqui a regra tem nome e valor.
 *
 * `escritura` é o topo — é o fim da regularização. **`cessao` fica abaixo
 * dela**: ceder posição contratual transfere quem está no contrato, não avança
 * o imóvel, e uma cessão registrada depois não pode fazer um imóvel já
 * escriturado regredir. Fica acima de `promessa_compra_venda` porque uma cessão
 * pressupõe um contrato existente para ceder.
 *
 * **Isto é premissa, não certeza.** Se a UP tratar cessão como estágio próprio,
 * o número muda aqui e em nenhum outro lugar.
 */
export const NIVEL_ESTAGIO: Record<TipoTransacao, number> = {
  pre_contrato: 1,
  promessa_compra_venda: 2,
  cessao: 3,
  escritura: 4,
};

export const ROTULO_TIPO_TRANSACAO: Record<TipoTransacao, string> = {
  pre_contrato: 'Pré-Contrato',
  promessa_compra_venda: 'CP',
  escritura: 'Escritura',
  cessao: 'Cessão',
};

/**
 * Cor do badge por tipo, em mapa **exato**.
 *
 * Nunca por `includes`: `'promessa_compra_venda'` contém `'compra'`, e
 * classificar por substring é como um tipo veste o badge do outro sem ninguém
 * perceber — o defeito real que `badgeRegularizacao` teve.
 */
export const COR_TIPO_TRANSACAO: Record<TipoTransacao, string> = {
  pre_contrato: 'padrao',
  promessa_compra_venda: 'info',
  escritura: 'sucesso',
  cessao: 'aviso',
};

/**
 * Status **derivado**, nunca persistido — pela mesma razão da fase de
 * regularização: status guardado diverge do dado que o originou.
 */
export type StatusTransacao = 'rascunho' | 'assinada' | 'cancelada';

export interface ParteTransacao {
  pessoa_id: number;
  papel: string;
  nome?: string | null;
}

export interface Transacao {
  id: number;
  tipo: TipoTransacao;
  imovel_id: number;
  imovel_tipo: string;
  /** `null` enquanto não assinada — é o que separa rascunho de assinada. */
  data_assinatura: string | null;
  valor: number | null;
  cancelada_em?: string | null;
  partes?: ParteTransacao[];
}

/** Resposta do adaptador enquanto a fonte não existe. */
export interface Indisponivel {
  disponivel: false;
  codigo: 'REG360_TRANSACAO_INDISPONIVEL';
  mensagem: string;
}

export const INDISPONIVEL: Indisponivel = {
  disponivel: false,
  codigo: 'REG360_TRANSACAO_INDISPONIVEL',
  mensagem: 'A entidade Transação ainda não existe no Núcleo. '
    + 'Enquanto isso, o preço de contrato do imóvel é o registro do valor combinado.',
};

// ---------------------------------------------------------------------------
// Derivações — escritas e testadas AGORA, com dados sintéticos do contrato.
//
// Elas existem sem fonte de propósito: no dia da virada a tela já sabe montar,
// e a virada não vira reescrita de tela.
// ---------------------------------------------------------------------------

function soData(v: unknown): string | null {
  if (!v) return null;
  const m = String(v).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

export function statusTransacao(t: any): StatusTransacao {
  if (t?.cancelada_em) return 'cancelada';
  return soData(t?.data_assinatura) ? 'assinada' : 'rascunho';
}

/** Uma transação vale para o histórico do imóvel? Cancelada não conta. */
export function efetiva(t: any): boolean {
  return statusTransacao(t) === 'assinada';
}

/**
 * Data de assinatura mais recente de cada tipo — o que o legado mostra no lote
 * como `Assinatura Pré-Contrato`, `Assinatura CP` e `Assinatura Escritura`.
 *
 * Só transação **assinada** entra: rascunho não tem data, e cancelada teve a
 * sua desfeita. Mostrar a data de uma transação cancelada diria que o imóvel
 * caminhou onde ele voltou.
 */
export function datasDeAssinatura(
  transacoes: any[],
): Partial<Record<TipoTransacao, string>> {
  const out: Partial<Record<TipoTransacao, string>> = {};
  for (const t of transacoes || []) {
    if (!efetiva(t)) continue;
    const tipo = t?.tipo as TipoTransacao;
    if (!TIPOS_TRANSACAO.includes(tipo)) continue;
    const data = soData(t.data_assinatura);
    if (!data) continue;
    const atual = out[tipo];
    if (!atual || data > atual) out[tipo] = data;
  }
  return out;
}

/**
 * O estágio do imóvel: o tipo **mais avançado** que ele alcançou.
 *
 * Não é "a transação mais recente por data" — uma cessão registrada hoje sobre
 * um imóvel que já tem escritura não faz o imóvel regredir. O avanço sai de
 * `NIVEL_ESTAGIO`, que é mapa explícito justamente para essa regra não depender
 * da ordem em que alguém escreveu uma constante.
 */
export function tipoMaisAvancado(transacoes: any[]): TipoTransacao | null {
  let melhor: TipoTransacao | null = null;
  let melhorNivel = 0;
  for (const t of transacoes || []) {
    if (!efetiva(t)) continue;
    const tipo = t?.tipo as TipoTransacao;
    const nivel = NIVEL_ESTAGIO[tipo];
    // Tipo desconhecido não tem nível e é ignorado, em vez de virar `undefined`
    // numa comparação — que seria sempre falsa e esconderia o problema.
    if (typeof nivel !== 'number') continue;
    if (nivel > melhorNivel) {
      melhorNivel = nivel;
      melhor = tipo;
    }
  }
  return melhor;
}

/** Badge do estágio para o cabeçalho do lote. `null` quando não há nenhuma. */
export function badgeTransacao(transacoes: any[]): { cor: string; rotulo: string } | null {
  const tipo = tipoMaisAvancado(transacoes);
  if (!tipo) return null;
  return { cor: COR_TIPO_TRANSACAO[tipo], rotulo: ROTULO_TIPO_TRANSACAO[tipo] };
}
