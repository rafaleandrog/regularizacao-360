import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { mapaComLimite } from '../../comum/concorrencia.js';

/** Espera um tick sem usar timer — mantém o teste determinístico e rápido. */
const tick = () => Promise.resolve();

describe('mapaComLimite', () => {
  test('preserva a ordem do resultado, não a de conclusão', async () => {
    const r = await mapaComLimite([1, 2, 3, 4, 5], 2, async (n) => {
      // Os ímpares terminam depois dos pares que vieram em seguida.
      if (n % 2 === 1) { await tick(); await tick(); }
      return n * 10;
    });
    assert.deepEqual(r, [10, 20, 30, 40, 50]);
  });

  test('nunca ultrapassa o limite de simultâneos', async () => {
    let ativos = 0;
    let pico = 0;
    await mapaComLimite(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      ativos++;
      pico = Math.max(pico, ativos);
      await tick();
      await tick();
      ativos--;
      return null;
    });
    assert.ok(pico <= 4, `pico foi ${pico}, esperado <= 4`);
    assert.ok(pico > 1, 'deveria haver paralelismo real');
  });

  test('lista vazia não dispara nada', async () => {
    let chamadas = 0;
    const r = await mapaComLimite([], 4, async () => { chamadas++; return 1; });
    assert.deepEqual(r, []);
    assert.equal(chamadas, 0);
  });

  test('lista ausente não quebra', async () => {
    assert.deepEqual(await mapaComLimite(undefined as any, 4, async () => 1), []);
  });

  test('limite maior que a lista não cria trabalhador ocioso', async () => {
    const r = await mapaComLimite([1, 2], 99, async (n) => n);
    assert.deepEqual(r, [1, 2]);
  });

  test('limite inválido vira 1 em vez de travar', async () => {
    for (const limite of [0, -3, NaN]) {
      assert.deepEqual(await mapaComLimite([1, 2, 3], limite, async (n) => n), [1, 2, 3]);
    }
  });

  test('cada item é visitado exatamente uma vez', async () => {
    const vistos: number[] = [];
    await mapaComLimite(Array.from({ length: 50 }, (_, i) => i), 7, async (n) => {
      vistos.push(n);
      await tick();
      return n;
    });
    assert.equal(vistos.length, 50);
    assert.equal(new Set(vistos).size, 50);
  });
});
