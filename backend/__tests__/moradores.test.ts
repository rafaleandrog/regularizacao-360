import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { situacaoCadastro, indexarPorPessoa, vinculosConhecidos } from '../../comum/moradores.js';

const PESSOA = { nome: 'Maria', cpf: '09977579148' };

describe('situacaoCadastro — "não sei" não é "não tem"', () => {
  test('tudo consultado e presente → completo', () => {
    const s = situacaoCadastro(PESSOA, {
      contatos: { telefones: [{}], emails: [] },
      vinculos: [{}],
    });
    assert.equal(s.estado, 'completo');
    assert.deepEqual(s.faltando, []);
  });

  test('vínculo NÃO consultado → indeterminado, nunca incompleto', () => {
    // É o caso da lista de moradores: o Núcleo não tem rota de pessoa →
    // imóveis, então a tela não sabe. Pintar de incompleto mandaria alguém
    // corrigir o que talvez não esteja quebrado.
    const s = situacaoCadastro(PESSOA, { contatos: { telefones: [{}], emails: [] } });
    assert.equal(s.estado, 'indeterminado');
    assert.deepEqual(s.faltando, []);
    assert.match(s.motivoIndeterminado!, /vínculo/);
  });

  test('vínculo consultado e VAZIO → incompleto, com certeza', () => {
    const s = situacaoCadastro(PESSOA, {
      contatos: { telefones: [{}], emails: [] },
      vinculos: [],
    });
    assert.equal(s.estado, 'incompleto');
    assert.deepEqual(s.faltando, ['vínculo com imóvel']);
  });

  test('nada consultado → indeterminado, dizendo os dois motivos', () => {
    const s = situacaoCadastro(PESSOA);
    assert.equal(s.estado, 'indeterminado');
    assert.match(s.motivoIndeterminado!, /contatos/);
    assert.match(s.motivoIndeterminado!, /vínculo/);
  });

  test('falta de nome ou CPF é sempre incompleto — não depende de consulta', () => {
    assert.equal(situacaoCadastro({ cpf: '1' }).estado, 'incompleto');
    assert.equal(situacaoCadastro({ nome: 'Maria' }).estado, 'incompleto');
    assert.deepEqual(situacaoCadastro({}).faltando, ['nome', 'CPF']);
  });

  test('PJ conta razão social e CNPJ nos mesmos lugares', () => {
    const s = situacaoCadastro({ razao_social: 'Acme', cnpj: '1' }, {
      contatos: { emails: [{}] }, vinculos: [{}],
    });
    assert.equal(s.estado, 'completo');
  });

  test('contatos consultados e vazios contam como falta', () => {
    const s = situacaoCadastro(PESSOA, { contatos: { telefones: [], emails: [] }, vinculos: [{}] });
    assert.deepEqual(s.faltando, ['telefone ou email']);
  });

  test('nome só de espaços não vale como nome', () => {
    assert.deepEqual(situacaoCadastro({ nome: '   ', cpf: '1' }).faltando, ['nome']);
  });
});

describe('indexarPorPessoa — o reverso que o Núcleo não entrega', () => {
  test('agrupa os imóveis de cada pessoa', () => {
    const l1 = { id: 1 };
    const l2 = { id: 2 };
    const mapa = indexarPorPessoa([
      { imovel: l1, vinculos: [{ pessoa_id: 7 }, { pessoa_id: 8 }] },
      { imovel: l2, vinculos: [{ pessoa_id: 7 }] },
    ]);
    assert.equal(mapa.get(7)!.length, 2);
    assert.equal(mapa.get(8)!.length, 1);
    assert.equal(mapa.get(9), undefined);
  });

  test('vínculo sem pessoa_id utilizável é descartado, não quebra', () => {
    const mapa = indexarPorPessoa([{ imovel: { id: 1 }, vinculos: [{}, { pessoa_id: 'x' }] }]);
    assert.equal(mapa.size, 0);
  });

  test('lista vazia devolve mapa vazio', () => {
    assert.equal(indexarPorPessoa([]).size, 0);
  });
});


describe('vinculosConhecidos — ausência no índice parcial não é ausência de vínculo', () => {
  test('pessoa no índice devolve a lista dela', () => {
    const idx = new Map<number, unknown[]>([[7, [{}, {}]]]);
    assert.equal(vinculosConhecidos(idx, 7)!.length, 2);
  });

  test('pessoa FORA do índice devolve undefined, nunca []', () => {
    // O índice cobre um parcelamento; a lista é da instância inteira. Traduzir
    // "não está no mapa" para [] marcaria incompleto quem está vinculada só a
    // outro parcelamento — e contradiz o que a tela promete no banner.
    const idx = new Map<number, unknown[]>([[7, [{}]]]);
    assert.equal(vinculosConhecidos(idx, 8), undefined);
    assert.notDeepEqual(vinculosConhecidos(idx, 8), []);
  });

  test('e a situação daí sai indeterminada, não incompleta', () => {
    const idx = new Map<number, unknown[]>([[7, [{}]]]);
    const s = situacaoCadastro({ nome: 'Maria', cpf: '1' }, {
      contatos: { telefones: [{}] },
      vinculos: vinculosConhecidos(idx, 8),
    });
    assert.equal(s.estado, 'indeterminado');
  });

  test('índice vazio não afirma nada sobre ninguém', () => {
    assert.equal(vinculosConhecidos(new Map(), 7), undefined);
  });
});
