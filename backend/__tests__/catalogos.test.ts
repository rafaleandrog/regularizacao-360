import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOGO_USO,
  CATALOGO_TIPO_LOTE,
  entradaDeUso,
  entradaDeTipoLote,
  rotuloDeUso,
  corDeUso,
  familiaDoUso,
  descricaoDeUso,
  tipoLoteDeUso,
  usosSemFamilia,
  sugestoesDeUso,
  sugestoesDeTipoLote,
} from '../../comum/catalogos.js';
import { respeitaPiso } from '../../comum/preco.js';

describe('catálogo de Uso — texto livre com sugestões, não enum', () => {
  test('CSIIR está completo: significado, família e origem', () => {
    const e = entradaDeUso('CSIIR');
    assert.ok(e, 'CSIIR deveria estar no catálogo');
    assert.equal(e.familia, 'comercial_misto');
    assert.equal(e.descricao, 'Comercial, Serviços, Industrial, Institucional e Residencial');
    assert.match(e.origem, /legado/i, 'toda entrada carrega de onde veio');
  });

  // A sigla termina em "Residencial", e uso misto NÃO é residencial para efeito
  // de piso — quem respondeu foi quem define o piso, não a leitura da sigla.
  test('CSIIR é comercial_misto, apesar do R no fim da sigla', () => {
    assert.equal(familiaDoUso('CSIIR'), 'comercial_misto');
    assert.notEqual(familiaDoUso('CSIIR'), 'residencial');
  });

  test('sigla com significado registrado — era metade do problema da #22', () => {
    assert.ok(descricaoDeUso('CSIIR'));
    // Valor desconhecido não inventa significado.
    assert.equal(descricaoDeUso('INVENTADO'), null);
  });

  // A lista fechou com os seis valores respondidos na #22 — cada um com
  // significado e família, não só CSIIR.
  test('lista de Uso tem os seis valores respondidos pelo Ricardo', () => {
    assert.deepEqual(
      CATALOGO_USO.map((e) => e.valor),
      ['CSIIR', 'INST', 'RE', 'RE 2', 'RE 3', 'RO'],
    );
    assert.equal(entradaDeUso('INST')?.descricao, 'Institucional');
    assert.equal(entradaDeUso('RE')?.descricao, 'Residencial Exclusivo');
    assert.equal(entradaDeUso('RE 2')?.descricao, 'Residencial Exclusivo 2');
    assert.equal(entradaDeUso('RE 3')?.descricao, 'Residencial Exclusivo 3');
    assert.equal(entradaDeUso('RO')?.descricao, 'Residencial Obrigatório');
  });

  test('família dos cinco valores novos: RE/RE 2/RE 3/RO residencial, INST comercial_misto', () => {
    assert.equal(familiaDoUso('RE'), 'residencial');
    assert.equal(familiaDoUso('RE 2'), 'residencial');
    assert.equal(familiaDoUso('RE 3'), 'residencial');
    assert.equal(familiaDoUso('RO'), 'residencial');
    // INST cai na mesma família de CSIIR — o Ricardo já classifica
    // institucional dentro do "I" de CSIIR.
    assert.equal(familiaDoUso('INST'), 'comercial_misto');
  });

  // Tipo de Lote não é campo do legado: é Residencial ou Comercial, sempre
  // derivado do Uso — a resposta que fechou a segunda metade da #22.
  test('Tipo de Lote é derivado, com os dois valores possíveis catalogados', () => {
    assert.deepEqual(
      CATALOGO_TIPO_LOTE.map((e) => e.valor),
      ['Residencial', 'Comercial'],
    );
    assert.deepEqual(sugestoesDeTipoLote(), ['Residencial', 'Comercial']);
    assert.ok(entradaDeTipoLote('Residencial'));
    assert.ok(entradaDeTipoLote('Comercial'));
    assert.equal(entradaDeTipoLote('qualquer'), null);
  });

  describe('tipoLoteDeUso — a derivação em si', () => {
    test('uso residencial vira Tipo de Lote Residencial', () => {
      assert.equal(tipoLoteDeUso('RE'), 'Residencial');
      assert.equal(tipoLoteDeUso('RE 2'), 'Residencial');
      assert.equal(tipoLoteDeUso('RE 3'), 'Residencial');
      assert.equal(tipoLoteDeUso('RO'), 'Residencial');
    });

    test('uso comercial_misto vira Tipo de Lote Comercial', () => {
      assert.equal(tipoLoteDeUso('CSIIR'), 'Comercial');
      assert.equal(tipoLoteDeUso('INST'), 'Comercial');
    });

    test('uso desconhecido não deriva Tipo de Lote nenhum', () => {
      assert.equal(tipoLoteDeUso('INVENTADO'), null);
      assert.equal(tipoLoteDeUso(null), null);
      assert.equal(tipoLoteDeUso(''), null);
    });
  });

  test('toda entrada carrega origem escrita — é o que o revisor lê para julgar', () => {
    for (const e of [...CATALOGO_USO, ...CATALOGO_TIPO_LOTE]) {
      assert.ok(e.origem.trim().length > 0, `${e.valor} sem origem`);
    }
  });

  test('sugestão não é allowlist: valor fora dela é aceito e volta como veio', () => {
    assert.deepEqual(sugestoesDeUso(), ['CSIIR', 'INST', 'RE', 'RE 2', 'RE 3', 'RO']);
    assert.equal(rotuloDeUso('RESIDENCIAL_UNIFAMILIAR'), 'RESIDENCIAL_UNIFAMILIAR');
  });
});

describe('rótulo e cor — desconhecido aparece, não some', () => {
  // Mesma regra do vínculo que não resolve (`#123` à mostra): dado que existe e
  // que não sabemos interpretar tem de aparecer, senão ninguém descobre.
  test('uso fora do catálogo volta com o valor cru, nunca com — ou vazio', () => {
    assert.equal(rotuloDeUso('COMERCIAL'), 'COMERCIAL');
  });

  test('vazio, nulo e só-espaços viram null — aí não há dado nenhum', () => {
    assert.equal(rotuloDeUso(''), null);
    assert.equal(rotuloDeUso(null), null);
    assert.equal(rotuloDeUso('   '), null);
  });

  test('cor de desconhecido é neutra — colorir por chute é vestir o badge do outro', () => {
    assert.equal(corDeUso('CSIIR'), 'info');
    assert.equal(corDeUso('INVENTADO'), 'padrao');
  });

  test('a comparação é exata, nunca por substring', () => {
    assert.equal(entradaDeUso('CSIIR_EXTRA'), null);
    assert.equal(entradaDeUso('CSII'), null);
    // E espaço em volta não cria um valor novo.
    assert.equal(entradaDeUso('  CSIIR  ')?.valor, 'CSIIR');
  });
});

describe('família de piso — o null que precisa ser visível', () => {
  test('uso fora do catálogo não tem família', () => {
    assert.equal(familiaDoUso('INVENTADO'), null);
  });

  // O ponto inteiro de `usosSemFamilia`: sem ele, o piso não checado responde
  // igual ao piso respeitado, e a tela não tem como distinguir.
  test('família nula faz respeitaPiso responder como se estivesse tudo bem', () => {
    const proposta = { preco_minimo_residencial: 180, preco_minimo_comercial_misto: 300 };
    const semFamilia = respeitaPiso(10, proposta, familiaDoUso('INVENTADO'));
    assert.deepEqual(semFamilia, { piso: null, abaixoDoPiso: false });

    const comFamilia = respeitaPiso(10, proposta, familiaDoUso('CSIIR'));
    assert.equal(comFamilia.piso, 300, 'CSIIR usa o piso comercial/misto, não o residencial');
    assert.equal(comFamilia.abaixoDoPiso, true, 'R$10 está abaixo de R$300');
  });

  test('CSIIR não entra na lista de pendências — tem família', () => {
    assert.deepEqual(usosSemFamilia(['CSIIR']), []);
  });

  test('usosSemFamilia lista só os desconhecidos, sem repetir e em ordem estável', () => {
    assert.deepEqual(
      usosSemFamilia(['CSIIR', 'COMERCIAL', 'CSIIR', 'ARMAZEM']),
      ['ARMAZEM', 'COMERCIAL'],
    );
  });

  test('vazios são ignorados, e lista ausente não quebra', () => {
    assert.deepEqual(usosSemFamilia([]), []);
    assert.deepEqual(usosSemFamilia(undefined as any), []);
    assert.deepEqual(usosSemFamilia(['', null, '  ']), []);
  });

  // Trava de regressão: todo valor hoje no catálogo tem família (nenhuma
  // entrada ficou com `familia: null`), então nenhum deles pode aparecer na
  // lista de pendências.
  test('uso com família conhecida sairia da lista', () => {
    const comFamilia = CATALOGO_USO.filter((e) => e.familia !== null).map((e) => e.valor);
    assert.deepEqual(usosSemFamilia(comFamilia), []);
  });
});
