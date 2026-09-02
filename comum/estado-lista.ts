/**
 * O estado vazio de uma lista (reg360) — lógica pura.
 *
 * "Nenhuma ação neste imóvel", "Nenhum lote cadastrado nesta instância",
 * "Nenhum morador": cada uma dessas frases é uma **afirmação sobre o mundo**,
 * e só é verdadeira depois de a lista ter sido lida. Lista vazia porque a
 * requisição falhou produz exatamente a mesma frase — e é indistinguível,
 * porque o banner de erro no topo da tela não desfaz a frase de baixo.
 *
 * A regra é a mesma em seis telas deste app, e ter uma cópia por tela é o modo
 * de elas divergirem: uma ganha a guarda, as outras não, e ninguém percebe
 * porque a que ficou para trás continua parecendo certa.
 *
 * Puro: recebe o estado da leitura e as frases, devolve o que exibir.
 */

import type { EstadoContagem } from './agregados.js';

export interface FrasesDaLista {
  /** O que dizer quando a leitura concluiu e a lista está mesmo vazia. */
  vazio: string;
  /** O que dizer enquanto a leitura corre. Omitido, usa o padrão. */
  carregando?: string;
  /** O que dizer quando a leitura falhou. Omitido, usa o padrão. */
  falhou?: string;
}

export interface EstadoDaLista {
  mensagem: string;
  submensagem: string;
  /**
   * A tela pode afirmar que não há nada? `false` enquanto a leitura corre e
   * depois de ela falhar. Quem exibe contagem, paginação ou filtro derivado da
   * lista consulta isto — não o `length`.
   */
  podeAfirmarVazio: boolean;
}

const CARREGANDO_PADRAO = 'Carregando…';
const FALHOU_PADRAO = 'Não foi possível carregar';

/**
 * A submensagem da falha é fixa e não é enfeite: ela nomeia o que a tela
 * **não** sabe. Sem ela, "Não foi possível carregar" ainda deixa o leitor
 * concluir que provavelmente não havia nada mesmo.
 */
export const SUBMENSAGEM_FALHA = 'O que está gravado não foi lido — pode haver registro aqui.';

export function estadoDaLista(estado: EstadoContagem, frases: FrasesDaLista): EstadoDaLista {
  if (estado === 'correndo') {
    return { mensagem: frases.carregando ?? CARREGANDO_PADRAO, submensagem: '', podeAfirmarVazio: false };
  }
  if (estado === 'falhou') {
    return { mensagem: frases.falhou ?? FALHOU_PADRAO, submensagem: SUBMENSAGEM_FALHA, podeAfirmarVazio: false };
  }
  return { mensagem: frases.vazio, submensagem: '', podeAfirmarVazio: true };
}

/**
 * Número que só pode ser exibido depois de lido.
 *
 * Devolve `null` quando a leitura não concluiu — e `null` é de propósito, não
 * `0`: quem chama tem de escolher uma frase, e não pode cair num número por
 * distração. É o mesmo motivo pelo qual `valorDoImovel` devolve `null` em vez
 * de zero.
 */
export function numeroLido(estado: EstadoContagem, quantidade: number): number | null {
  return estado === 'concluida' ? quantidade : null;
}
