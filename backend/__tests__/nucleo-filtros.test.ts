import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FILTROS_NUCLEO,
  filtrosNaoSuportados,
  conferirFiltros,
  linhasForaDoFiltro,
  linhasDaPagina,
  ErroDeFiltro,
} from '../../comum/nucleo-filtros.js';

// ---------------------------------------------------------------------------
// filtrosNaoSuportados
// ---------------------------------------------------------------------------

test('filtro que o recurso honra não sobra', () => {
  assert.deepEqual(filtrosNaoSuportados('parcelamentos', { setor_habitacional_id: 2 }), []);
  assert.deepEqual(filtrosNaoSuportados('lotes', { parcelamento_id: 46 }), []);
});

test('parcelamento_id em unidades é apontado — a coluna não existe', () => {
  // O caso real: a v0.1.1 pedia isto, o Núcleo ignorava, e voltavam as
  // unidades da instância inteira como se fossem daquele parcelamento.
  assert.deepEqual(filtrosNaoSuportados('unidades', { parcelamento_id: 46 }), ['parcelamento_id']);
});

test('recurso que não aceita filtro nenhum aponta tudo', () => {
  assert.deepEqual(filtrosNaoSuportados('setores-habitacionais', { nome: 'Colorado' }), ['nome']);
  assert.deepEqual(filtrosNaoSuportados('matriculas', { numero: '123' }), ['numero']);
});

test('paginação, busca e removido não são recorte por coluna', () => {
  assert.deepEqual(
    filtrosNaoSuportados('lotes', { busca: 'quadra 3', pagina: 2, por_pagina: 200, removido: 'excluir' }),
    [],
  );
});

test('valor vazio não vira filtro — não vai na query string', () => {
  assert.deepEqual(filtrosNaoSuportados('lotes', { quadra: '', conjunto: null, rua: undefined }), []);
});

test('recurso fora da tabela é tratado como desconhecido, não como permissivo', () => {
  // Fail-closed: sem allowlist não dá para afirmar que o Núcleo obedece.
  assert.deepEqual(filtrosNaoSuportados('transacoes', { lote_id: 1 }), ['lote_id']);
});

// ---------------------------------------------------------------------------
// conferirFiltros
// ---------------------------------------------------------------------------

test('conferirFiltros deixa passar o que é honrado', () => {
  assert.doesNotThrow(() => conferirFiltros('lotes', { parcelamento_id: 46, pagina: 1 }));
  assert.doesNotThrow(() => conferirFiltros('setores-habitacionais', {}));
});

test('conferirFiltros barra o filtro ignorado e diz o que o recurso aceita', () => {
  assert.throws(
    () => conferirFiltros('unidades', { parcelamento_id: 46 }),
    (e: unknown) => {
      assert.ok(e instanceof ErroDeFiltro);
      assert.equal((e as ErroDeFiltro).codigo, 'FILTRO_NAO_SUPORTADO');
      const m = (e as Error).message;
      assert.match(m, /parcelamento_id/);
      assert.match(m, /incorporacao_id/); // o que ela de fato aceita
      return true;
    },
  );
});

test('recurso sem filtro nenhum diz isso, em vez de listar nada', () => {
  assert.throws(
    () => conferirFiltros('matriculas', { numero: '9' }),
    /não aceita filtro nenhum/,
  );
});

// ---------------------------------------------------------------------------
// linhasForaDoFiltro
// ---------------------------------------------------------------------------

test('linhas do recorte pedido não contam como fora', () => {
  const linhas = [
    { id: 1, parcelamento_id: 46 },
    { id: 2, parcelamento_id: 46 },
  ];
  assert.equal(linhasForaDoFiltro({ parcelamento_id: 46 }, linhas), 0);
});

test('id numérico contra filtro em texto não é falso positivo', () => {
  assert.equal(linhasForaDoFiltro({ parcelamento_id: '46' }, [{ parcelamento_id: 46 }]), 0);
});

test('linha fora do recorte é contada — é o Núcleo tendo ignorado o filtro', () => {
  const linhas = [
    { id: 1, parcelamento_id: 46 },
    { id: 2, parcelamento_id: 47 },
    { id: 3, parcelamento_id: 99 },
  ];
  assert.equal(linhasForaDoFiltro({ parcelamento_id: 46 }, linhas), 2);
});

test('campo ausente na linha é pulado — não dá para conferir o que não vem', () => {
  assert.equal(linhasForaDoFiltro({ tipo: 'fisica' }, [{ id: 1, nome: 'Ana' }]), 0);
});

test('sem filtro não há o que conferir', () => {
  assert.equal(linhasForaDoFiltro({}, [{ id: 1 }, { id: 2 }]), 0);
  assert.equal(linhasForaDoFiltro({ pagina: 2 }, [{ id: 1 }]), 0);
});

// ---------------------------------------------------------------------------
// linhasDaPagina
// ---------------------------------------------------------------------------

test('página legitimamente vazia passa', () => {
  assert.deepEqual(linhasDaPagina({ dados: [], total: 0 }, 'lotes'), []);
});

test('envelope sem `dados` é erro, não lista vazia', () => {
  // Era `resposta?.dados || []`: envelope trocado virava "não tem dado".
  for (const ruim of [{}, null, undefined, { dados: null }, { dados: 'nada' }, { linhas: [] }]) {
    assert.throws(() => linhasDaPagina(ruim, 'lotes'), ErroDeFiltro);
  }
});

// ---------------------------------------------------------------------------
// A tabela em si
// ---------------------------------------------------------------------------

test('a tabela cobre todos os recursos que a app lista', () => {
  // Se a app passar a listar um recurso novo, ele precisa entrar aqui — senão
  // `conferirFiltros` o recusa, que é o comportamento desejado, mas o teste
  // avisa antes de a tela quebrar.
  for (const r of ['parcelamentos', 'lotes', 'unidades', 'setores-habitacionais', 'matriculas', 'pessoas']) {
    assert.ok(FILTROS_NUCLEO[r], `${r} fora da tabela de filtros`);
  }
});

test('unidades não aceita parcelamento_id, e lotes aceita', () => {
  // O par que define o objeto de navegação da app.
  assert.ok(!FILTROS_NUCLEO.unidades.includes('parcelamento_id'));
  assert.ok(FILTROS_NUCLEO.lotes.includes('parcelamento_id'));
});
