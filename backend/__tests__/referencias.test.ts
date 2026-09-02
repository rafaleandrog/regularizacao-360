import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  estadoDaReferencia,
  TEXTO_REFERENCIA,
  rotuloReferencia,
} from '../../comum/referencias.js';

describe('estadoDaReferencia — "não tem" e "ainda não sei" não são a mesma coisa', () => {
  test('alvo carregado: quem fala é o nome', () => {
    assert.equal(estadoDaReferencia({ resolvida: true, temId: true }), 'resolvida');
    assert.equal(TEXTO_REFERENCIA.resolvida, null);
  });

  // O defeito que isto conserta: o KPI do detalhe do imóvel mostrava `—` para
  // lote COM matrícula, enquanto a carga (disparada em segundo plano) não
  // tinha terminado. `—` afirma "não tem".
  test('tem id e não resolveu: é reticência, não travessão', () => {
    assert.equal(estadoDaReferencia({ resolvida: false, temId: true }), 'nao_resolvida');
    assert.equal(TEXTO_REFERENCIA.nao_resolvida, '…');
    assert.notEqual(TEXTO_REFERENCIA.nao_resolvida, TEXTO_REFERENCIA.ausente);
  });

  test('não tem id: aí o travessão é verdade', () => {
    assert.equal(estadoDaReferencia({ resolvida: false, temId: false }), 'ausente');
    assert.equal(TEXTO_REFERENCIA.ausente, '—');
  });

  test('resolvida vence, mesmo sem id — o alvo em mãos é o fato mais forte', () => {
    assert.equal(estadoDaReferencia({ resolvida: true, temId: false }), 'resolvida');
  });
});

describe('rotuloReferencia — o rótulo pronto', () => {
  test('com nome, devolve o nome', () => {
    assert.equal(rotuloReferencia('Mat. 4808 — 2° CRI/DF', 12), 'Mat. 4808 — 2° CRI/DF');
  });

  test('sem nome mas com id: reticência', () => {
    assert.equal(rotuloReferencia(null, 12), '…');
    assert.equal(rotuloReferencia(undefined, 12), '…');
  });

  test('sem nome e sem id: travessão', () => {
    assert.equal(rotuloReferencia(null, null), '—');
    assert.equal(rotuloReferencia(null, undefined), '—');
  });

  // `matricula_id` chega do payload como número ou string; zero e vazio não são
  // referência, e tratá-los como id faria a tela prometer um alvo inexistente.
  test('id vazio, zero e string vazia contam como ausente', () => {
    assert.equal(rotuloReferencia(null, 0), '—');
    assert.equal(rotuloReferencia(null, ''), '—');
    assert.equal(rotuloReferencia(null, '0'), '—');
  });

  test('id como string numérica é id de verdade', () => {
    assert.equal(rotuloReferencia(null, '12'), '…');
  });

  test('nome só com espaços não conta como resolvido', () => {
    assert.equal(rotuloReferencia('   ', 12), '…');
    assert.equal(rotuloReferencia('   ', null), '—');
  });
});
