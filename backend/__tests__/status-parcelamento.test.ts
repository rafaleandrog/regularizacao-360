import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { badgeStatusParcelamento } from '../../comum/status-parcelamento.js';

describe('badgeStatusParcelamento', () => {
  test('os três status que o Núcleo deriva', () => {
    assert.deepEqual(badgeStatusParcelamento('registrado'), { cor: 'sucesso', label: 'Registrado' });
    assert.deepEqual(badgeStatusParcelamento('irregular'), { cor: 'perigo', label: 'Irregular' });
    assert.deepEqual(badgeStatusParcelamento('nao_registrado'), { cor: 'padrao', label: 'Não registrado' });
  });

  test('REGRESSÃO: nao_registrado nunca vira Registrado', () => {
    // A versão por substring casava 'registrad' dentro de 'nao_registrado' e
    // pintava de verde um parcelamento que não está registrado.
    const b = badgeStatusParcelamento('nao_registrado');
    assert.notEqual(b.label, 'Registrado');
    assert.notEqual(b.cor, 'sucesso');
  });

  test('caixa e espaço não mudam o resultado', () => {
    assert.equal(badgeStatusParcelamento(' REGISTRADO ').label, 'Registrado');
  });

  test('status desconhecido aparece cru, sem aproximação', () => {
    assert.deepEqual(badgeStatusParcelamento('caucionado'), { cor: 'padrao', label: 'caucionado' });
  });

  test('vazio, nulo e indefinido viram travessão', () => {
    for (const v of ['', null, undefined]) {
      assert.deepEqual(badgeStatusParcelamento(v), { cor: 'padrao', label: '—' });
    }
  });
});
