import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paiDaUnidade, avisoDeHeranca } from '../../comum/unidade-cadeia.js';

// O caso comum: a incorporação cobre um lote só.
test('incorporação sobre um lote resolve parcelamento E lote', () => {
  const pai = paiDaUnidade([{ id: 10, parcelamento_id: 46 }]);
  assert.equal(pai.parcelamentoId, 46);
  assert.equal(pai.loteId, 10);
  assert.equal(pai.quantidadeDeLotes, 1);
  assert.equal(pai.ambiguo, false);
  assert.equal(avisoDeHeranca(pai), null); // nada a explicar
});

test('vários lotes no MESMO parcelamento: herda parcelamento, pula o lote', () => {
  // `lotes.incorporacao_id` é N:1 — não existe "o lote" desta unidade, mas o
  // parcelamento é único e a herança de preço continua valendo por ele.
  const pai = paiDaUnidade([
    { id: 10, parcelamento_id: 46 },
    { id: 11, parcelamento_id: 46 },
    { id: 12, parcelamento_id: 46 },
  ]);
  assert.equal(pai.parcelamentoId, 46);
  assert.equal(pai.loteId, null, 'eleger um irmão inventaria vínculo que o Núcleo não modela');
  assert.equal(pai.quantidadeDeLotes, 3);
  assert.equal(pai.ambiguo, false);
  assert.match(avisoDeHeranca(pai)!, /pula o nível de Lote/);
});

test('lotes em parcelamentos DIFERENTES: não herda nada acima', () => {
  const pai = paiDaUnidade([
    { id: 10, parcelamento_id: 46 },
    { id: 11, parcelamento_id: 47 },
  ]);
  assert.equal(pai.parcelamentoId, null);
  assert.equal(pai.loteId, null);
  assert.equal(pai.ambiguo, true);
  const aviso = avisoDeHeranca(pai)!;
  assert.match(aviso, /parcelamentos diferentes/);
  assert.match(aviso, /própria unidade/);
});

test('incorporação sem lote nenhum é caso normal, não erro', () => {
  const pai = paiDaUnidade([]);
  assert.equal(pai.parcelamentoId, null);
  assert.equal(pai.loteId, null);
  assert.equal(pai.quantidadeDeLotes, 0);
  assert.equal(pai.ambiguo, false);
  assert.match(avisoDeHeranca(pai)!, /não tem lote vinculado/);
});

test('entrada ausente ou inválida não quebra', () => {
  for (const ruim of [null, undefined, 'nada' as any, 42 as any]) {
    const pai = paiDaUnidade(ruim);
    assert.equal(pai.quantidadeDeLotes, 0);
    assert.equal(pai.ambiguo, false);
  }
});

test('parcelamento_id ausente no payload não vira divergência falsa', () => {
  // `lotes.parcelamento_id` é NOT NULL no Núcleo; payload truncado não pode
  // virar NaN no conjunto e fingir que os lotes discordam.
  const pai = paiDaUnidade([
    { id: 10, parcelamento_id: 46 },
    { id: 11 },
  ]);
  assert.equal(pai.ambiguo, false);
  assert.equal(pai.parcelamentoId, 46);
});

test('id em texto e em número são o mesmo parcelamento', () => {
  const pai = paiDaUnidade([
    { id: 10, parcelamento_id: '46' },
    { id: 11, parcelamento_id: 46 },
  ]);
  assert.equal(pai.ambiguo, false);
  assert.equal(pai.parcelamentoId, 46);
});

test('um lote só, mas sem parcelamento legível: não inventa parcelamento', () => {
  const pai = paiDaUnidade([{ id: 10 }]);
  assert.equal(pai.parcelamentoId, null);
  assert.equal(pai.loteId, 10);
});
