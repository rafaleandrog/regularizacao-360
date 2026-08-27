import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizarTexto, filtrarPorTexto } from '../../comum/busca.js';

const PARCELAMENTOS = [
  { nome: 'Pôr do Sol', slug: 'por_do_sol' },
  { nome: 'Bianca', slug: 'bianca' },
  { nome: 'Império dos Nobres - Etapa 01', slug: 'imperio_dos_nobres_1' },
  { nome: 'Chácara São José', slug: 'sao_jose' },
  { nome: 'Urbita - Etapa 3/4', slug: 'urbita_etapa_3' },
];

describe('normalizarTexto', () => {
  test('tira acento e caixa', () => {
    assert.equal(normalizarTexto('Pôr do Sol'), 'por do sol');
    assert.equal(normalizarTexto('IMPÉRIO'), 'imperio');
    assert.equal(normalizarTexto('Chácara São José'), 'chacara sao jose');
  });

  test('nulo, indefinido e número não quebram', () => {
    assert.equal(normalizarTexto(null), '');
    assert.equal(normalizarTexto(undefined), '');
    assert.equal(normalizarTexto(42), '42');
  });

  test('espaço nas pontas some', () => {
    assert.equal(normalizarTexto('  Bianca  '), 'bianca');
  });
});

describe('filtrarPorTexto', () => {
  const campos = ['nome', 'slug'];

  test('acha ignorando acento — o caso que o ILIKE do Núcleo perderia', () => {
    const r = filtrarPorTexto(PARCELAMENTOS, 'por do sol', campos);
    assert.deepEqual(r.map((p) => p.slug), ['por_do_sol']);
  });

  test('acha pelo slug (a "sigla" da tela)', () => {
    const r = filtrarPorTexto(PARCELAMENTOS, 'imperio_dos_nobres_1', campos);
    assert.equal(r.length, 1);
    assert.equal(r[0].nome, 'Império dos Nobres - Etapa 01');
  });

  test('acha pelo nome com acento digitado', () => {
    assert.equal(filtrarPorTexto(PARCELAMENTOS, 'Império', campos).length, 1);
  });

  test('parcial casa no meio da palavra', () => {
    assert.equal(filtrarPorTexto(PARCELAMENTOS, 'etapa', campos).length, 2);
  });

  test('termo vazio devolve tudo — sem filtro não é nada encontrado', () => {
    assert.equal(filtrarPorTexto(PARCELAMENTOS, '', campos).length, PARCELAMENTOS.length);
    assert.equal(filtrarPorTexto(PARCELAMENTOS, '   ', campos).length, PARCELAMENTOS.length);
  });

  test('sem correspondência devolve vazio', () => {
    assert.deepEqual(filtrarPorTexto(PARCELAMENTOS, 'zzz', campos), []);
  });

  test('lista vazia ou ausente não quebra', () => {
    assert.deepEqual(filtrarPorTexto([], 'x', campos), []);
    assert.deepEqual(filtrarPorTexto(undefined as any, 'x', campos), []);
  });

  test('campo ausente no item não quebra', () => {
    assert.deepEqual(filtrarPorTexto([{ nome: 'A' } as any], 'a', ['nome', 'slug']), [{ nome: 'A' }]);
  });
});
