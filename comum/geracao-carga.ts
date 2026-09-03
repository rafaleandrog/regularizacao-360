/**
 * Token de geração de carga (reg360) — lógica pura.
 *
 * `_carregar()` em `frontend/index.ts` zera o estado de forma síncrona no
 * topo e depois faz `await` por view. Se o usuário navega de novo antes de a
 * primeira resposta chegar, a resposta atrasada da rota ANTERIOR escrevia por
 * cima do estado da rota nova — `detalhe`, `lotes`, `propostas` — e o `catch`
 * externo marcava `cargaFalhou` da rota nova por uma falha da anterior.
 *
 * A defesa é a mesma usada no índice de Moradores (fila, PR #93) e na carga
 * de regularização (uma em voo por vez, PR #94), generalizada: cada chamada a
 * `_carregar()` incrementa um contador e captura o valor ANTES do primeiro
 * `await`; só quem ainda carrega o valor mais recente pode escrever estado.
 *
 * Puro: recebe as duas gerações, devolve se a resposta ainda vale.
 */

export interface DecisaoDeResposta {
  /** Pedido de geração antiga: `false` sempre, mesmo se a leitura teve sucesso. */
  geracaoDoPedido: number;
  /** Geração mais recente já disparada, no momento em que a resposta chega. */
  geracaoAtual: number;
}

/**
 * A resposta pode escrever estado? Só quando a geração que a pediu ainda é a
 * mais recente — ou seja, ninguém navegou de novo enquanto ela estava em voo.
 *
 * `>=` e não `===`: comparar por igualdade quebraria se `geracaoAtual` algum
 * dia regredisse (não regride hoje, mas a decisão não deveria depender disso
 * para estar certa) — o pedido só é velho quando uma geração POSTERIOR já foi
 * disparada.
 */
export function deveAplicarResposta({ geracaoDoPedido, geracaoAtual }: DecisaoDeResposta): boolean {
  return geracaoDoPedido >= geracaoAtual;
}
