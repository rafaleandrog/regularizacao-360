/**
 * Execução com limite de concorrência (reg360).
 *
 * Existe por uma limitação concreta do Núcleo: o vínculo imóvel↔pessoa
 * (`imovel_pessoas`) só é alcançável **por imóvel**, em `GET /lotes/:id/pessoas`.
 * Não há expansão em lote nem filtro por lista de ids — nem na listagem de
 * lotes, nem na de imóveis, nem na de pessoas.
 *
 * Então mostrar a coluna "Pessoas" numa tabela de lotes custa uma requisição
 * por linha. Disparar 25 de uma vez estoura o limite de conexões do navegador
 * e enfileira de forma imprevisível; disparar uma de cada vez soma latência.
 * O meio-termo é uma janela fixa.
 */

/**
 * Aplica `fn` a cada item com no máximo `limite` execuções simultâneas,
 * preservando a ORDEM do resultado (índice de entrada = índice de saída).
 *
 * Diferente de `Promise.all(itens.map(fn))`, que dispara tudo de uma vez.
 */
export async function mapaComLimite<T, R>(
  itens: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const entrada = itens || [];
  if (entrada.length === 0) return [];
  const teto = Math.max(1, Math.floor(limite) || 1);

  const saida = new Array<R>(entrada.length);
  let proximo = 0;

  async function trabalhador(): Promise<void> {
    while (true) {
      const i = proximo++;
      if (i >= entrada.length) return;
      saida[i] = await fn(entrada[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(teto, entrada.length) }, () => trabalhador()),
  );
  return saida;
}
