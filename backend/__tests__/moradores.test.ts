import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  situacaoCadastro,
  indexarPorPessoa,
  vinculosConhecidos,
  estadoDosOcupantes,
  TEXTO_OCUPANTES,
} from '../../comum/moradores.js';

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

// ---------------------------------------------------------------------------

import { semCamposProtegidos, lerQuitacao, CAMPOS_SO_POR_ROTA_PROPRIA } from '../../comum/quitacao.js';

describe('semCamposProtegidos — rota descritiva não pula gate de rota dedicada', () => {
  test('corpo normal passa', () => {
    assert.deepEqual(semCamposProtegidos({ preco_m2_manual: 10, observacao: 'x' }), { ok: true });
    assert.deepEqual(semCamposProtegidos({}), { ok: true });
  });

  test('quitado no corpo é RECUSADO, não ignorado', () => {
    // Ignorar em silêncio deixaria o cliente achar que gravou.
    const r = semCamposProtegidos({ preco_m2_manual: 10, quitado: true });
    assert.ok('erro' in r);
    assert.match((r as any).erro, /quitado/);
  });

  test('preço de contrato também é protegido — tem gate próprio', () => {
    assert.ok('erro' in semCamposProtegidos({ preco_estatico: 100 }));
  });

  test('valor falsy não escapa: é a PRESENÇA da chave que conta', () => {
    // `quitado: false` desmarcaria a quitação passando por baixo do gate.
    assert.ok('erro' in semCamposProtegidos({ quitado: false }));
    assert.ok('erro' in semCamposProtegidos({ preco_estatico: null }));
  });

  test('todos os campos protegidos são acusados de uma vez', () => {
    const corpo = Object.fromEntries(CAMPOS_SO_POR_ROTA_PROPRIA.map((c) => [c, 1]));
    const r = semCamposProtegidos(corpo);
    assert.ok('erro' in r);
    for (const c of CAMPOS_SO_POR_ROTA_PROPRIA) assert.match((r as any).erro, new RegExp(c));
  });
});

describe('lerQuitacao', () => {
  test('registro inexistente é NÃO QUITADO, não desconhecido', () => {
    // A maioria dos imóveis nunca foi editada e não tem linha na tabela.
    assert.deepEqual(lerQuitacao(null), { quitado: false, em: null, porNome: null });
    assert.deepEqual(lerQuitacao({}), { quitado: false, em: null, porNome: null });
  });

  test('quitado traz data e autor junto', () => {
    const q = lerQuitacao({ quitado: true, quitado_em: '2026-08-28', quitado_por_nome: 'Ana' });
    assert.deepEqual(q, { quitado: true, em: '2026-08-28', porNome: 'Ana' });
  });
});

describe('estadoDosOcupantes — não consultado não é vazio', () => {
  test('perguntou e não veio ninguém: aí sim é vazio', () => {
    assert.equal(
      estadoDosOcupantes({ consultado: true, falhou: false, quantidade: 0 }),
      'vazio',
    );
    assert.equal(TEXTO_OCUPANTES.vazio, 'Nenhum morador vinculado.');
  });

  // O defeito que isto conserta: a tela da unidade nunca perguntava (o
  // carregamento era gateado em `ehLote`) e mesmo assim afirmava "nenhum".
  test('não perguntou: a tela não pode afirmar que não há', () => {
    assert.equal(
      estadoDosOcupantes({ consultado: false, falhou: false, quantidade: 0 }),
      'nao_consultado',
    );
    assert.notEqual(TEXTO_OCUPANTES.nao_consultado, TEXTO_OCUPANTES.vazio);
  });

  // Quem falha fica no mapa com lista vazia, para a tela não repetir a
  // requisição a cada render. Sem a marca de falha, isso viraria "nenhum".
  test('falha vence "consultado", porque falha entra no mapa como lista vazia', () => {
    assert.equal(
      estadoDosOcupantes({ consultado: true, falhou: true, quantidade: 0 }),
      'falhou',
    );
    assert.notEqual(TEXTO_OCUPANTES.falhou, TEXTO_OCUPANTES.vazio);
  });

  test('com ocupantes quem fala é a lista, não uma frase', () => {
    assert.equal(
      estadoDosOcupantes({ consultado: true, falhou: false, quantidade: 3 }),
      'com_ocupantes',
    );
    assert.equal(TEXTO_OCUPANTES.com_ocupantes, null);
  });

  test('falha com ocupantes carregados antes ainda é falha — o número pode ter mudado', () => {
    assert.equal(
      estadoDosOcupantes({ consultado: true, falhou: true, quantidade: 2 }),
      'falhou',
    );
  });

  test('os quatro estados têm texto declarado, e só um é null', () => {
    const nulos = Object.values(TEXTO_OCUPANTES).filter((v) => v === null);
    assert.equal(nulos.length, 1, 'só com_ocupantes dispensa frase');
  });
});
