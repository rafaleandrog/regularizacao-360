/**
 * Referência lógica por id — e os três estados que ela tem na tela.
 *
 * Este app aponta para o Núcleo **por id lógico, sem FK** (ver
 * [`modelo-dados.md`](../docs/modelo-dados.md)). A consequência é que um campo
 * de referência tem sempre três situações possíveis, e duas delas parecem a
 * mesma coisa se ninguém separar:
 *
 * | Estado | Significa | Na tela |
 * |---|---|---|
 * | `resolvida` | há id, e o alvo foi carregado | o nome do alvo |
 * | `nao_resolvida` | **há id**, e o alvo ainda não veio (ou falhou) | `…` |
 * | `ausente` | **não há id** — o imóvel realmente não tem matrícula | `—` |
 *
 * **`—` é uma afirmação: "não tem".** Usá-lo enquanto a carga não terminou diz
 * ao usuário que o imóvel não tem matrícula, quando ele tem uma que a tela
 * ainda não leu. E as cargas que resolvem essas referências são disparadas em
 * segundo plano (`void this._carregarMatriculas()`), então a janela existe em
 * toda abertura de tela — não é caso raro.
 *
 * A tabela de lotes e o cabeçalho do parcelamento já faziam a distinção certa;
 * o KPI do detalhe do imóvel não fazia, e mostrava `—` para lote com matrícula.
 * Três lugares com a mesma regra escrita à mão são três chances de divergir —
 * daí a regra morar aqui.
 */

export type EstadoReferencia = 'resolvida' | 'nao_resolvida' | 'ausente';

export function estadoDaReferencia(v: {
  /** O alvo foi carregado? */
  resolvida: boolean;
  /** Existe id apontando para algum alvo? */
  temId: boolean;
}): EstadoReferencia {
  if (v?.resolvida) return 'resolvida';
  return v?.temId ? 'nao_resolvida' : 'ausente';
}

/**
 * O texto dos estados em que **não há nome a mostrar**. `null` em `resolvida`:
 * aí quem fala é o nome do alvo.
 */
export const TEXTO_REFERENCIA: Record<EstadoReferencia, string | null> = {
  resolvida: null,
  nao_resolvida: '…',
  ausente: '—',
};

/**
 * O rótulo pronto: o nome quando resolvida, o símbolo do estado quando não.
 *
 * `nome` entra como `string | null` de propósito — quem chama já tem o alvo em
 * mãos ou não, e a função não busca nada.
 */
export function rotuloReferencia(nome: string | null | undefined, temId: unknown): string {
  const resolvida = typeof nome === 'string' && nome.trim().length > 0;
  const estado = estadoDaReferencia({
    resolvida,
    temId: temId !== null && temId !== undefined && temId !== '' && Number(temId) !== 0,
  });
  return estado === 'resolvida' ? String(nome) : TEXTO_REFERENCIA[estado]!;
}
