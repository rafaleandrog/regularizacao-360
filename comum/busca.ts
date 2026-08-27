/**
 * Busca textual no cliente (reg360).
 *
 * Existe porque os 60 parcelamentos já estão em memória — o `nucleo-cliente`
 * varre e memoriza o conjunto inteiro. Ir ao servidor a cada tecla desfaria o
 * cache e daria uma resposta mais lenta e menos tolerante do que esta: o
 * `busca` do Núcleo é `ILIKE` sobre as colunas, então **não** cruza acento, e
 * "por do sol" não acharia "Pôr do Sol".
 *
 * Puro: sem fetch, sem Lit. Testado.
 */

/**
 * Minúsculas e sem acento, para que "Pôr do Sol", "por do sol" e "POR DO SOL"
 * sejam o mesmo termo. `NFD` separa a letra do diacrítico; o replace remove só
 * o diacrítico, preservando a letra.
 */
export function normalizarTexto(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Itens cujo valor em QUALQUER um dos campos contém o termo.
 *
 * Termo vazio devolve a lista intacta — "sem filtro" não é "nada encontrado",
 * distinção que decide se a tela mostra tudo ou um estado vazio.
 */
export function filtrarPorTexto<T>(itens: T[], termo: string, campos: Array<keyof T | string>): T[] {
  const alvo = normalizarTexto(termo);
  if (!alvo) return itens;
  return (itens || []).filter((item) =>
    campos.some((campo) => normalizarTexto((item as any)?.[campo]).includes(alvo)),
  );
}
