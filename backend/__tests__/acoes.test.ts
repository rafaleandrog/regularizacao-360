import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  badgeAcao,
  destacaNoCabecalho,
  tituloAcao,
  apenasEditaveisAcao,
  lerVinculosImovel,
  lerVinculosPessoa,
  lerFiltroImovel,
} from '../../comum/acoes.js';

describe('badgeAcao — cor e rótulo por tipo, sem substring', () => {
  test('cada tipo tem a sua cor', () => {
    assert.equal(badgeAcao({ tipo: 'revisional' }).cor, 'aviso');
    assert.equal(badgeAcao({ tipo: 'obrigacao_de_fazer' }).cor, 'info');
    assert.equal(badgeAcao({ tipo: 'outra' }).cor, 'padrao');
  });

  test('tipo desconhecido cai em "outra" em vez de quebrar a tela', () => {
    assert.equal(badgeAcao({ tipo: 'usucapiao' }).cor, 'padrao');
    assert.equal(badgeAcao({}).rotulo, 'Ação');
    assert.equal(badgeAcao(null).rotulo, 'Ação');
  });

  test('a classificação é por igualdade, nunca por substring', () => {
    // 'obrigacao_de_fazer'.includes('obrigacao') é true, e classificar assim é
    // como um status vira o badge do outro sem ninguém perceber.
    assert.notEqual(badgeAcao({ tipo: 'obrigacao' }).rotulo, badgeAcao({ tipo: 'obrigacao_de_fazer' }).rotulo);
  });
});

describe('destacaNoCabecalho', () => {
  test('só ação ativa vira badge de destaque', () => {
    assert.equal(destacaNoCabecalho({ status: 'ativa' }), true);
    assert.equal(destacaNoCabecalho({ status: 'encerrada' }), false);
    assert.equal(destacaNoCabecalho({ status: 'suspensa' }), false);
  });
});

describe('tituloAcao — o polo decide os lados', () => {
  test('UP no polo ativo', () => {
    assert.equal(
      tituloAcao({ tipo: 'obrigacao_de_fazer', polo: 'up_contra' }, 'B Lote 1'),
      'Ação de Obrigação de Fazer de UP contra B Lote 1',
    );
  });

  test('UP no polo passivo — o sentido inverte', () => {
    assert.equal(
      tituloAcao({ tipo: 'revisional', polo: 'contra_up' }, 'B Lote 1'),
      'Ação Revisional de B Lote 1 contra UP',
    );
  });

  test('sem alvo conhecido o título ainda diz o polo, sem mentir', () => {
    assert.equal(
      tituloAcao({ tipo: 'revisional', polo: 'contra_up' }),
      'Ação Revisional de a parte contrária contra UP',
    );
    assert.equal(
      tituloAcao({ tipo: 'revisional', polo: 'contra_up' }, '   '),
      'Ação Revisional de a parte contrária contra UP',
    );
  });
});

describe('apenasEditaveisAcao', () => {
  test('descarta o que o cliente não pode escrever', () => {
    const out = apenasEditaveisAcao({
      tipo: 'revisional', valor: 10, id: 99, criado_por_id: 7, deletado_em: 'x',
    });
    assert.deepEqual(Object.keys(out).sort(), ['tipo', 'valor']);
  });
});

describe('lerVinculosImovel', () => {
  test('lista ausente é lista vazia, não erro — ação pode ser só de pessoa', () => {
    assert.deepEqual(lerVinculosImovel(undefined), { vinculos: [] });
    assert.deepEqual(lerVinculosImovel(null), { vinculos: [] });
  });

  test('imovel_tipo fora do catálogo é rejeitado', () => {
    const r = lerVinculosImovel([{ imovel_id: 1, imovel_tipo: 'gleba' }]);
    assert.ok('erro' in r);
  });

  test('imovel_id não inteiro é rejeitado', () => {
    assert.ok('erro' in lerVinculosImovel([{ imovel_id: 'x', imovel_tipo: 'lote' }]));
    assert.ok('erro' in lerVinculosImovel([{ imovel_id: 0, imovel_tipo: 'lote' }]));
  });

  test('repetido no mesmo corpo é descartado, não vira conflito', () => {
    const r = lerVinculosImovel([
      { imovel_id: 5, imovel_tipo: 'lote' },
      { imovel_id: 5, imovel_tipo: 'lote' },
    ]);
    assert.ok('vinculos' in r && r.vinculos.length === 1);
  });

  test('mesmo número em tipos diferentes são DOIS imóveis', () => {
    const r = lerVinculosImovel([
      { imovel_id: 5, imovel_tipo: 'lote' },
      { imovel_id: 5, imovel_tipo: 'unidade' },
    ]);
    assert.ok('vinculos' in r && r.vinculos.length === 2);
  });
});

describe('lerVinculosPessoa', () => {
  test('papel ausente vira interessado', () => {
    const r = lerVinculosPessoa([{ pessoa_id: 3 }]);
    assert.ok('vinculos' in r && r.vinculos[0].papel === 'interessado');
  });

  test('papel fora do catálogo é rejeitado', () => {
    assert.ok('erro' in lerVinculosPessoa([{ pessoa_id: 3, papel: 'testemunha' }]));
  });

  test('pessoa repetida no mesmo corpo entra uma vez', () => {
    const r = lerVinculosPessoa([{ pessoa_id: 3 }, { pessoa_id: 3, papel: 'autor' }]);
    assert.ok('vinculos' in r && r.vinculos.length === 1);
  });
});

describe('lerFiltroImovel — os dois campos, ou nenhum', () => {
  test('nenhum dos dois é filtro ausente, não erro', () => {
    assert.deepEqual(lerFiltroImovel({}), { filtro: null });
    assert.deepEqual(lerFiltroImovel(undefined), { filtro: null });
  });

  test('só o id é 400 — filtro pela metade tem cara de certo e não é', () => {
    assert.ok('erro' in lerFiltroImovel({ imovel_id: '5' }));
  });

  test('só o tipo é 400', () => {
    assert.ok('erro' in lerFiltroImovel({ imovel_tipo: 'lote' }));
  });

  test('os dois juntos passam, com o id como número', () => {
    assert.deepEqual(lerFiltroImovel({ imovel_id: '5', imovel_tipo: 'lote' }),
      { filtro: { imovel_id: 5, imovel_tipo: 'lote' } });
  });

  test('string vazia conta como ausente nos dois campos', () => {
    assert.deepEqual(lerFiltroImovel({ imovel_id: '', imovel_tipo: '' }), { filtro: null });
  });
});
