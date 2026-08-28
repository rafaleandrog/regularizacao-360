import { urbiVerso } from './reg360-env.js';
import {
  DISPONIVEL,
  INDISPONIVEL,
  badgeTransacao,
  datasDeAssinatura,
  ROTULO_TIPO_TRANSACAO,
  TIPOS_TRANSACAO,
  type Transacao,
  type TipoTransacao,
} from '../comum/transacoes-contrato.js';

/**
 * Adaptador de Transação no frontend.
 *
 * Tela nenhuma conhece o formato de Transação — ela pergunta a este módulo. É o
 * que faz o critério da issue #36 valer: trocar `DISPONIVEL` não exige mexer em
 * tela nenhuma.
 */

export { badgeTransacao, datasDeAssinatura, ROTULO_TIPO_TRANSACAO, TIPOS_TRANSACAO };
export type { Transacao, TipoTransacao };

/** Mensagem única do estado indisponível — a tela não a reescreve. */
export const MENSAGEM_INDISPONIVEL = INDISPONIVEL.mensagem;

export function transacaoDisponivel(): boolean {
  return DISPONIVEL;
}

/**
 * Transações de um imóvel.
 *
 * Devolve lista **vazia** quando indisponível, e não erro: a tela desenha o
 * mesmo caminho nos dois casos, e quem decide mostrar o aviso é
 * `transacaoDisponivel()`. Lançar aqui obrigaria cada chamador a um `try`.
 */
export async function transacoesDoImovel(
  imovelTipo: string,
  imovelId: number,
): Promise<Transacao[]> {
  if (!DISPONIVEL) return [];
  const r: any = await urbiVerso.api(
    `/transacoes?imovel_tipo=${encodeURIComponent(imovelTipo)}&imovel_id=${imovelId}`,
  );
  return r?.dados || [];
}

/**
 * Linhas prontas para a tabela: rótulo, data e valor já extraídos.
 *
 * Existe para que a tela **não conheça os campos** de `Transacao`. Ler
 * `data_assinatura` e `valor` no template seria conhecimento de formato fora do
 * adaptador — e é exatamente isso que faria o dia da virada virar caça a
 * referências, que é o que este módulo existe para evitar.
 */
export function linhasDaTabela(
  transacoes: Transacao[],
): Array<{ id: number; tipo: string; data: string | null; valor: number | null }> {
  return (transacoes || []).map((t) => ({
    id: t.id,
    tipo: ROTULO_TIPO_TRANSACAO[t.tipo] ?? String(t.tipo),
    data: t.data_assinatura ?? null,
    valor: t.valor ?? null,
  }));
}

/**
 * As três datas que o legado mostra no lote, já rotuladas e na ordem do
 * negócio. Sem fonte, todas saem `null` — e a tela renderiza `—`, que é a
 * verdade, em vez de esconder as linhas e fazer o campo sumir sem explicação.
 */
export function linhasDeAssinatura(
  transacoes: Transacao[],
): Array<{ tipo: TipoTransacao; rotulo: string; data: string | null }> {
  const datas = datasDeAssinatura(transacoes);
  return TIPOS_TRANSACAO
    .filter((t) => t !== 'cessao')
    .map((tipo) => ({
      tipo,
      rotulo: `Assinatura ${ROTULO_TIPO_TRANSACAO[tipo]}`,
      data: datas[tipo] ?? null,
    }));
}
