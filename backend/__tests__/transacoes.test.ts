import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  statusTransacao,
  efetiva,
  datasDeAssinatura,
  tipoMaisAvancado,
  badgeTransacao,
  DISPONIVEL,
  TIPOS_TRANSACAO,
  NIVEL_ESTAGIO,
} from '../../comum/transacoes-contrato.js';

// Dados sintéticos do contrato — a entidade não existe no Núcleo, e a derivação
// é escrita e testada AGORA para que a virada não vire reescrita de tela.
const t = (tipo: string, data: string | null, extra: Record<string, unknown> = {}) =>
  ({ id: 1, tipo, imovel_id: 1, imovel_tipo: 'lote', data_assinatura: data, valor: null, ...extra });

describe('statusTransacao — derivado, nunca persistido', () => {
  test('sem data de assinatura é rascunho', () => {
    assert.equal(statusTransacao(t('escritura', null)), 'rascunho');
  });
  test('com data é assinada', () => {
    assert.equal(statusTransacao(t('escritura', '2026-03-01')), 'assinada');
  });
  test('cancelada vence a data — ela foi desfeita', () => {
    assert.equal(statusTransacao(t('escritura', '2026-03-01', { cancelada_em: '2026-04-01' })), 'cancelada');
  });
});

describe('datasDeAssinatura', () => {
  test('a mais recente de cada tipo', () => {
    const d = datasDeAssinatura([
      t('pre_contrato', '2025-01-10'),
      t('pre_contrato', '2025-06-20'),
      t('promessa_compra_venda', '2026-02-01'),
    ]);
    assert.equal(d.pre_contrato, '2025-06-20');
    assert.equal(d.promessa_compra_venda, '2026-02-01');
    assert.equal(d.escritura, undefined);
  });

  test('cancelada NÃO entra — diria que o imóvel caminhou onde voltou', () => {
    const d = datasDeAssinatura([
      t('escritura', '2026-05-01', { cancelada_em: '2026-06-01' }),
    ]);
    assert.equal(d.escritura, undefined);
  });

  test('rascunho não entra, e tipo desconhecido é ignorado sem quebrar', () => {
    const d = datasDeAssinatura([t('escritura', null), t('usucapiao' as any, '2026-01-01')]);
    assert.deepEqual(d, {});
  });

  test('lista vazia ou nula devolve objeto vazio', () => {
    assert.deepEqual(datasDeAssinatura([]), {});
    assert.deepEqual(datasDeAssinatura(null as any), {});
  });
});

describe('tipoMaisAvancado — avanço é pela ordem do negócio, não pela data', () => {
  test('escritura vence CP mesmo sendo mais antiga', () => {
    assert.equal(tipoMaisAvancado([
      t('escritura', '2024-01-01'),
      t('promessa_compra_venda', '2026-01-01'),
    ]), 'escritura');
  });

  test('cessão registrada depois NÃO faz o imóvel regredir da escritura', () => {
    // Ceder posição contratual transfere QUEM está no contrato; não avança o
    // imóvel. Um imóvel escriturado continua escriturado.
    assert.equal(tipoMaisAvancado([
      t('escritura', '2024-01-01'),
      t('cessao', '2026-01-01'),
    ]), 'escritura');
  });

  test('cessão fica acima de pré-contrato e de CP — ela pressupõe um contrato', () => {
    assert.equal(tipoMaisAvancado([
      t('cessao', '2020-01-01'),
      t('pre_contrato', '2026-01-01'),
    ]), 'cessao');
    assert.equal(tipoMaisAvancado([
      t('promessa_compra_venda', '2026-01-01'),
      t('cessao', '2020-01-01'),
    ]), 'cessao');
  });

  test('tipo desconhecido é ignorado, não vira nível undefined', () => {
    assert.equal(tipoMaisAvancado([t('usucapiao' as any, '2026-01-01')]), null);
    assert.equal(tipoMaisAvancado([
      t('usucapiao' as any, '2026-01-01'),
      t('pre_contrato', '2020-01-01'),
    ]), 'pre_contrato');
  });

  test('só conta transação efetiva', () => {
    assert.equal(tipoMaisAvancado([t('escritura', null)]), null);
    assert.equal(tipoMaisAvancado([t('escritura', '2026-01-01', { cancelada_em: '2026-02-01' })]), null);
  });

  test('sem transação não há estágio', () => {
    assert.equal(tipoMaisAvancado([]), null);
    assert.equal(badgeTransacao([]), null);
  });
});

describe('badgeTransacao — mapa exato, nunca substring', () => {
  test('cada tipo tem a sua cor e o seu rótulo', () => {
    assert.deepEqual(badgeTransacao([t('promessa_compra_venda', '2026-01-01')]), { cor: 'info', rotulo: 'CP' });
    assert.deepEqual(badgeTransacao([t('escritura', '2026-01-01')]), { cor: 'sucesso', rotulo: 'Escritura' });
  });
});

describe('o interruptor', () => {
  test('DISPONIVEL é falso — a entidade não existe no Núcleo', () => {
    assert.equal(DISPONIVEL, false);
  });
  test('o avanço sai de um mapa explícito, NÃO da ordem do array', () => {
    // Derivar da posição no array acopla a regra à ordem de escrita de uma
    // constante: reordenar por estética mudaria o badge de todo imóvel, calado.
    assert.equal(NIVEL_ESTAGIO.escritura > NIVEL_ESTAGIO.cessao, true,
      'escritura é o topo — é o fim da regularização');
    assert.equal(NIVEL_ESTAGIO.cessao > NIVEL_ESTAGIO.promessa_compra_venda, true);
    assert.equal(NIVEL_ESTAGIO.promessa_compra_venda > NIVEL_ESTAGIO.pre_contrato, true);
    // Todo tipo do catálogo tem nível: tipo sem nível seria ignorado em silêncio.
    for (const tipo of TIPOS_TRANSACAO) {
      assert.equal(typeof NIVEL_ESTAGIO[tipo], 'number', `${tipo} sem nível`);
    }
  });
});
