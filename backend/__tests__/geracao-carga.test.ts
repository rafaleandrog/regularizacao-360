import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { deveAplicarResposta } from '../../comum/geracao-carga.js';

describe('deveAplicarResposta — resposta velha não escreve sobre rota nova', () => {
  // O defeito real (#95): usuário navega de novo antes da resposta anterior
  // chegar, e ela escreve por cima do estado da rota nova quando finalmente
  // resolve. A geração do pedido continua sendo a de quando ele foi disparado
  // — só ela diz se ainda é a mais recente.
  test('pedido de geração anterior à atual é recusado', () => {
    assert.equal(deveAplicarResposta({ geracaoDoPedido: 1, geracaoAtual: 2 }), false);
  });

  test('pedido da própria geração atual é aceito', () => {
    assert.equal(deveAplicarResposta({ geracaoDoPedido: 2, geracaoAtual: 2 }), true);
  });

  test('sem navegação nenhuma (primeira carga), a única geração se aceita', () => {
    assert.equal(deveAplicarResposta({ geracaoDoPedido: 1, geracaoAtual: 1 }), true);
  });

  // Não é `===`: um pedido de geração posterior à "atual" registrada não deve
  // ser recusado por essa comparação — só geração ESTRITAMENTE anterior é velha.
  test('pedido mais novo que o registrado como atual também é aceito', () => {
    assert.equal(deveAplicarResposta({ geracaoDoPedido: 3, geracaoAtual: 2 }), true);
  });
});
