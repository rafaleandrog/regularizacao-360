import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  lerQuitacao,
  estadoDaQuitacao,
  TEXTO_QUITACAO,
  podeAlternarQuitacao,
} from '../../comum/quitacao.js';

describe('estadoDaQuitacao — "não perguntei" não é "não quitado"', () => {
  // O defeito real: `dadosDoImovel` é `{}` enquanto a carga corre e continua
  // `{}` se ela falhar. `Boolean(undefined)` é `false`, então o badge
  // "Quitado" SOME de um imóvel quitado — e some com a mesma cara de um
  // imóvel que de fato não está quitado.
  test('leitura em voo não afirma nada sobre a quitação', () => {
    assert.equal(estadoDaQuitacao('correndo', {}), 'nao_lida');
    assert.equal(estadoDaQuitacao('correndo', { quitado: true }), 'nao_lida');
  });

  test('falha vence o objeto — quem falha deixa `{}` para trás', () => {
    assert.equal(estadoDaQuitacao('falhou', {}), 'falhou');
    assert.notEqual(TEXTO_QUITACAO.falhou, TEXTO_QUITACAO.nao_lida);
  });

  test('só depois de ler é que "sem registro" significa não quitado', () => {
    assert.equal(estadoDaQuitacao('concluida', {}), 'nao_quitado');
    assert.equal(estadoDaQuitacao('concluida', { quitado: true }), 'quitado');
  });

  test('nos dois estados apurados quem fala é o badge, não uma frase', () => {
    assert.equal(TEXTO_QUITACAO.quitado, null);
    assert.equal(TEXTO_QUITACAO.nao_quitado, null);
    const nulos = Object.values(TEXTO_QUITACAO).filter((v) => v === null);
    assert.equal(nulos.length, 2, 'só os dois estados lidos dispensam frase');
  });

  // Oferecer "Marcar como quitado" a um imóvel já quitado pede ao usuário que
  // confirme uma coisa que a tela não sabe — e o botão é escolhido pelo
  // estado errado, não pelo estado desconhecido.
  test('o botão de quitar/desquitar só aparece depois da leitura', () => {
    assert.equal(podeAlternarQuitacao('nao_lida'), false);
    assert.equal(podeAlternarQuitacao('falhou'), false);
    assert.equal(podeAlternarQuitacao('quitado'), true);
    assert.equal(podeAlternarQuitacao('nao_quitado'), true);
  });

  test('lerQuitacao continua respondendo só o que o registro diz', () => {
    assert.deepEqual(lerQuitacao({ quitado: true, quitado_em: '2026-01-02', quitado_por_nome: 'Ana' }), {
      quitado: true, em: '2026-01-02', porNome: 'Ana',
    });
    assert.deepEqual(lerQuitacao({}), { quitado: false, em: null, porNome: null });
  });
});
