import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  faseRegularizacao,
  badgeFase,
  badgeSituacaoRegistral,
  situacaoRegistralRelevante,
  apenasEditaveisParcelamento,
  FASES,
  SITUACOES_REGISTRAIS,
} from '../../comum/regularizacao.js';

describe('faseRegularizacao — ordem inversa', () => {
  test('nenhuma data → irregular', () => {
    assert.equal(faseRegularizacao({}), 'irregular');
  });

  test('cada data isolada leva à sua fase', () => {
    assert.equal(faseRegularizacao({ data_envio_projeto: '2026-01-10' }), 'em_analise');
    assert.equal(faseRegularizacao({ data_aprovacao_conplan: '2026-02-10' }), 'aprovado');
    assert.equal(faseRegularizacao({ data_decreto_gdf: '2026-03-10' }), 'registrado');
  });

  test('PRECEDÊNCIA: as três preenchidas → registrado, o estágio mais avançado', () => {
    assert.equal(faseRegularizacao({
      data_envio_projeto: '2026-01-10',
      data_aprovacao_conplan: '2026-02-10',
      data_decreto_gdf: '2026-03-10',
    }), 'registrado');
  });

  test('pula estágio: decreto sem CONPLAN ainda é registrado', () => {
    assert.equal(faseRegularizacao({ data_decreto_gdf: '2026-03-10' }), 'registrado');
  });

  test('CONPLAN preenchida e decreto vazio → aprovado', () => {
    assert.equal(faseRegularizacao({
      data_aprovacao_conplan: '2026-02-10',
      data_decreto_gdf: null,
    }), 'aprovado');
  });

  test('registro inexistente é irregular, não erro', () => {
    assert.equal(faseRegularizacao(null), 'irregular');
    assert.equal(faseRegularizacao(undefined), 'irregular');
  });

  test('string vazia não conta como data preenchida', () => {
    assert.equal(faseRegularizacao({ data_decreto_gdf: '' }), 'irregular');
  });

  test('aceita timestamp completo, não só YYYY-MM-DD', () => {
    // O driver entrega DATE como string crua, mas defensivo contra o caso.
    assert.equal(faseRegularizacao({ data_decreto_gdf: '2026-03-10T00:00:00Z' }), 'registrado');
  });
});

describe('badgeFase', () => {
  test('as quatro fases têm rótulo e cor', () => {
    for (const f of FASES) {
      const b = badgeFase(f.id);
      assert.equal(b.rotulo, f.rotulo);
      assert.equal(b.cor, f.cor);
    }
  });

  test('fase desconhecida volta crua em cor neutra, sem aproximação', () => {
    const b = badgeFase('caucionado');
    assert.equal(b.rotulo, 'caucionado');
    assert.equal(b.cor, 'padrao');
  });

  test('caixa e espaço não mudam o resultado', () => {
    assert.equal(badgeFase(' REGISTRADO ').rotulo, 'Registrado');
  });
});

describe('situação registral — eixo ortogonal à fase', () => {
  test('as três situações têm rótulo', () => {
    for (const s of SITUACOES_REGISTRAIS) {
      assert.equal(badgeSituacaoRegistral(s.id).rotulo, s.rotulo);
    }
  });

  test('só é relevante quando é exceção', () => {
    assert.equal(situacaoRegistralRelevante('caucionado'), true);
    assert.equal(situacaoRegistralRelevante('prenotado'), true);
    assert.equal(situacaoRegistralRelevante('nenhuma'), false);
    assert.equal(situacaoRegistralRelevante(''), false);
    assert.equal(situacaoRegistralRelevante(null), false);
  });

  test('caucionado e aprovado coexistem — é o motivo dos dois eixos', () => {
    const dados = { data_aprovacao_conplan: '2026-02-10', situacao_registral: 'caucionado' };
    assert.equal(faseRegularizacao(dados), 'aprovado');
    assert.equal(situacaoRegistralRelevante(dados.situacao_registral), true);
  });
});

describe('apenasEditaveisParcelamento', () => {
  test('deixa passar só a whitelist', () => {
    const r = apenasEditaveisParcelamento({
      numero_decreto: 'PROJETO EM ELABORAÇÃO',
      area_poligonal: 34521,
      parcelamento_id: 99,   // chave, não editável por aqui
      id: 1,                 // nunca
      inventado: 'x',
    });
    assert.deepEqual(r, { numero_decreto: 'PROJETO EM ELABORAÇÃO', area_poligonal: 34521 });
  });

  test('null explícito passa — é como se limpa um campo', () => {
    assert.deepEqual(apenasEditaveisParcelamento({ data_decreto_gdf: null }), { data_decreto_gdf: null });
  });

  test('undefined não passa — ausente não é "limpar"', () => {
    assert.deepEqual(apenasEditaveisParcelamento({ data_decreto_gdf: undefined }), {});
  });

  test('fonte nula não quebra', () => {
    assert.deepEqual(apenasEditaveisParcelamento(null), {});
  });
});
