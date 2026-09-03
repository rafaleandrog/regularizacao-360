import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  lerQuitacao,
  estadoDaQuitacao,
  TEXTO_QUITACAO,
  podeAlternarQuitacao,
  semCamposProtegidos,
  apenasEditaveisImovel,
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

describe('semCamposProtegidos — o PUT descritivo não escreve por cima da quitação nem do preço', () => {
  // É a issue #20: o corpo que tenta escrever `preco_estatico` por uma rota
  // descritiva não pode ser aceito. `erro`, não descarte silencioso — cliente
  // que manda o campo errado precisa saber que não gravou, não achar que sim.
  test('preco_estatico num corpo alheio é recusado, não ignorado', () => {
    const r = semCamposProtegidos({ uso: 'CSIIR', preco_estatico: 999 });
    assert.ok('erro' in r);
    assert.match((r as { erro: string }).erro, /preco_estatico/);
  });

  test('quitado também é recusado, mesmo junto de campo legítimo', () => {
    const r = semCamposProtegidos({ observacao: 'nota', quitado: true });
    assert.ok('erro' in r);
    assert.match((r as { erro: string }).erro, /quitado/);
  });

  test('corpo só com campos descritivos passa limpo', () => {
    assert.deepEqual(semCamposProtegidos({ uso: 'CSIIR', observacao: 'nota' }), { ok: true });
    assert.deepEqual(semCamposProtegidos({}), { ok: true });
  });
});

describe('apenasEditaveisImovel — allowlist do PUT descritivo', () => {
  test('extrai uso e observacao, ignora o resto', () => {
    assert.deepEqual(
      apenasEditaveisImovel({ uso: 'CSIIR', observacao: 'nota', quitado: true, algo_mais: 1 }),
      { uso: 'CSIIR', observacao: 'nota' },
    );
  });

  // tipo_lote não é editável por aqui, de propósito — é sempre derivado do
  // Uso (tipoLoteDeUso, em comum/catalogos.ts), nunca gravado. Um corpo que
  // mande tipo_lote não deve fazer a allowlist "aprender" o campo.
  test('tipo_lote não é aceito — é sempre derivado do Uso, nunca gravado', () => {
    assert.deepEqual(
      apenasEditaveisImovel({ uso: 'RE', tipo_lote: 'Residencial' }),
      { uso: 'RE' },
    );
  });

  test('campo ausente no corpo não aparece no resultado, mesmo como undefined', () => {
    const r = apenasEditaveisImovel({ uso: 'CSIIR' });
    assert.deepEqual(r, { uso: 'CSIIR' });
    assert.equal('observacao' in r, false);
  });

  test('corpo vazio ou nulo devolve objeto vazio, nunca lança', () => {
    assert.deepEqual(apenasEditaveisImovel({}), {});
    assert.deepEqual(apenasEditaveisImovel(null), {});
    assert.deepEqual(apenasEditaveisImovel(undefined), {});
  });
});
