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

  test('Tipo de Lote está vazio, e isso é um fato registrado', () => {
    assert.deepEqual(CATALOGO_TIPO_LOTE, []);
    assert.equal(entradaDeTipoLote('qualquer'), null);
    assert.deepEqual(sugestoesDeTipoLote(), []);
  });

  test('toda entrada carrega origem escrita — é o que o revisor lê para julgar', () => {
    for (const e of [...CATALOGO_USO, ...CATALOGO_TIPO_LOTE]) {
      assert.ok(e.origem.trim().length > 0, `${e.valor} sem origem`);
    }
  });

  test('sugestão não é allowlist: valor fora dela é aceito e volta como veio', () => {
    assert.deepEqual(sugestoesDeUso(), ['CSIIR']);
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

  // Trava para o dia em que os valores chegarem: uso COM família não entra na
  // lista de pendências. Hoje nenhum tem, então o teste guarda o contrato.
  test('uso com família conhecida sairia da lista', () => {
    const comFamilia = CATALOGO_USO.filter((e) => e.familia !== null).map((e) => e.valor);
    assert.deepEqual(usosSemFamilia(comFamilia), []);
  });
});
