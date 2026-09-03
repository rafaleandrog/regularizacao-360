/**
 * O estado vazio de uma lista (reg360) — lógica pura.
 *
 * "Nenhuma ação neste imóvel", "Nenhum lote cadastrado nesta instância",
 * "Nenhum morador": cada uma dessas frases é uma **afirmação sobre o mundo**,
 * e só é verdadeira depois de a lista ter sido lida. Lista vazia porque a
 * requisição falhou produz exatamente a mesma frase — e é indistinguível,
 * porque o banner de erro no topo da tela não desfaz a frase de baixo.
 *
  * A regra é a mesma em sete telas deste app, e ter uma cópia por tela é o modo
  * de elas divergirem — mas nenhuma das sete tinha a guarda. A única lista que a
  * implementava era a de setores da home (PR #90), e ali estava a divergência real:
  * na home guardada contra todas as outras desguardadas. A sétima tela (Parcelamentos)
  * só foi descoberta depois de a lista se apresentar como fechada sem estar.
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
 * distração. O motivo é o mesmo que em `valorDoImovel`: ambos usam `null` para
 * forçar quem chama a distinguir, mas as causas diferem — ali dado ausente, aqui
 * leitura não concluída.
 */
export function numeroLido(estado: EstadoContagem, quantidade: number): number | null {
  return estado === 'concluida' ? quantidade : null;
}

/**
 * O símbolo de um valor solto (não uma lista) que só pode afirmar "não tem"
 * depois da leitura concluir. Mesma distinção de `comum/referencias.ts`
 * (`TEXTO_REFERENCIA`), aplicada a um campo sem id de referência — como as
 * datas de assinatura de Transação: `—` enquanto a leitura correu ou falhou
 * diria "não assinou" quando na verdade é "não sei ainda".
 */
export const TEXTO_AUSENCIA: Record<EstadoContagem, string> = {
  correndo: '…',
  falhou: '…',
  concluida: '—',
};

/** Sufixo que denuncia números de uma paginação como sendo de leitura anterior. */
const SUFIXO_NUMEROS_ANTIGOS = ' (números da leitura anterior)';

/**
 * Sufixo de rodapé de paginação, para quando a página atual falhou mas o
 * total exibido é de uma leitura anterior — a paginação continua no ar em vez
 * de sumir, e o sufixo é o que impede o número de parecer atual.
 *
 * Estava duplicado cru em duas telas (lotes globais e moradores) antes deste
 * módulo: cada cópia lia seu próprio estado, sem checagem cruzada entre elas.
 */
export function sufixoNumerosAntigos(estado: EstadoContagem): string {
  return estado === 'falhou' ? SUFIXO_NUMEROS_ANTIGOS : '';
}

/** O que um badge de lista mostra: cor e rótulo, ou nenhum badge. */
export type BadgeOuNulo = { cor: string; rotulo: string } | null;

/**
 * Decide entre o badge normal (derivado da lista) e um aviso de leitura
 * falhada — com a prioridade FIXA na função, não no `if` de quem chama.
 *
 * Badge ausente afirma, em silêncio, que a lista não tem nada que renderize
 * badge. Com a leitura falhada isso é afirmação sobre o que não foi lido — daí
 * o aviso ter que vencer o badge normal (que tende a estar `null`, porque a
 * lista falhada está vazia) sempre que a leitura falhou e o recurso está
 * disponível. Reordenar um `if` escrito à mão perderia essa prioridade calado;
 * aqui não há `if` para reordenar.
 */
export function badgeOuAvisoDeFalha(
  disponivel: boolean,
  estado: EstadoContagem,
  badgeNormal: BadgeOuNulo,
  avisoDeFalha: BadgeOuNulo,
): BadgeOuNulo {
  return disponivel && estado === 'falhou' ? avisoDeFalha : badgeNormal;
}
