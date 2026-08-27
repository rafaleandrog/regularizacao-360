import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  proximaPagina,
  chaveCache,
  POR_PAGINA_NUCLEO,
  TETO_PAGINAS,
} from '../../comum/paginacao.js';

/** Página cheia genérica, com os quatro campos que o Núcleo devolve. */
function pagina(linhas: number, extra: Record<string, unknown> = {}) {
  return { dados: Array.from({ length: linhas }, (_, i) => ({ id: i })), ...extra };
}

describe('proximaPagina — quando parar a varredura', () => {
  test('página cheia com mais páginas à frente → pede a seguinte', () => {
    const r = pagina(200, { pagina: 1, por_pagina: 200, paginas: 32, total: 6233 });
    assert.equal(proximaPagina(r, 1, 200), 2);
  });

  test('página vazia → fim', () => {
    assert.equal(proximaPagina({ dados: [] }, 3, 400), null);
  });

  test('dados ausente (resposta malformada) → fim, sem lançar', () => {
    assert.equal(proximaPagina({}, 1, 0), null);
  });

  test('pagina >= paginas → fim', () => {
    const r = pagina(200, { pagina: 32, por_pagina: 200, paginas: 32 });
    assert.equal(proximaPagina(r, 32, 6400), null);
  });

  test('total já acumulado → fim, mesmo com página cheia', () => {
    const r = pagina(200, { por_pagina: 200, total: 400 });
    assert.equal(proximaPagina(r, 2, 400), null);
  });

  test('página incompleta → é a última', () => {
    const r = pagina(33, { pagina: 32, por_pagina: 200 });
    assert.equal(proximaPagina(r, 32, 6233), null);
  });

  test('sem total nem paginas, página cheia → continua (só o tamanho decide)', () => {
    const r = pagina(200, { por_pagina: 200 });
    assert.equal(proximaPagina(r, 1, 200), 2);
  });

  test('sem por_pagina, sem total, sem paginas → continua enquanto vier dado', () => {
    // Endpoint que não preenche metadado nenhum: só a página vazia encerra.
    assert.equal(proximaPagina(pagina(50), 1, 50), 2);
  });

  test('teto de páginas encerra a varredura mesmo com página sempre cheia', () => {
    const r = pagina(200, { por_pagina: 200 });
    assert.equal(proximaPagina(r, TETO_PAGINAS, TETO_PAGINAS * 200), null);
    assert.equal(proximaPagina(r, TETO_PAGINAS - 1, 0), TETO_PAGINAS);
  });

  test('total = 0 encerra sem pedir nada além da primeira', () => {
    assert.equal(proximaPagina({ dados: [], total: 0, paginas: 0 }, 1, 0), null);
  });

  test('o teto do Núcleo é 200', () => {
    assert.equal(POR_PAGINA_NUCLEO, 200);
  });
});

describe('chaveCache — identidade do conjunto pedido', () => {
  test('ordem dos filtros não cria duas entradas', () => {
    assert.equal(
      chaveCache('lotes', { parcelamento_id: 46, busca: 'x' }),
      chaveCache('lotes', { busca: 'x', parcelamento_id: 46 }),
    );
  });

  test('filtro vazio não separa cache de recurso sem filtro', () => {
    // undefined/null/'' nao viram query string, entao nao podem virar chave.
    assert.equal(chaveCache('parcelamentos', { setor_habitacional_id: undefined }), 'parcelamentos');
    assert.equal(chaveCache('parcelamentos', { busca: '' }), 'parcelamentos');
    assert.equal(chaveCache('parcelamentos', {}), 'parcelamentos');
    assert.equal(chaveCache('parcelamentos'), 'parcelamentos');
  });

  test('filtros diferentes são conjuntos diferentes', () => {
    assert.notEqual(chaveCache('lotes', { parcelamento_id: 46 }), chaveCache('lotes', { parcelamento_id: 47 }));
  });

  test('zero é filtro legítimo e não some', () => {
    assert.equal(chaveCache('lotes', { quantidade: 0 }), 'lotes?quantidade=0');
  });
});
