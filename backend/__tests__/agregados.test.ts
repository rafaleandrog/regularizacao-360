import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  agregarImoveis, somarAgregados, indexarPropostas, vigentePorCascata, chaveImovel,
} from '../../comum/agregados.js';

const HOJE = '2026-06-15';

function prop(nivel: string, refId: number, preco: number, extra: Record<string, unknown> = {}) {
  return {
    nivel, ref_id: refId, preco_m2: preco, status_aprovacao: 'aprovada',
    data_proposta: '2026-01-01', data_fim_vigencia: '2026-12-31', ...extra,
  };
}
const lote = (id: number, area: number | null, extra: Record<string, unknown> = {}) =>
  ({ id, parcelamento_id: 46, area, area_efetiva: area, ...extra });

describe('indexarPropostas e cascata', () => {
  test('índice guarda só a vigente de cada alvo', () => {
    const idx = indexarPropostas([
      prop('setor', 2, 100),
      prop('setor', 2, 90, { data_proposta: '2025-01-01', data_fim_vigencia: '2025-12-31' }), // vencida
      prop('lote', 1, 300, { status_aprovacao: 'pendente' }), // não aprovada
    ], HOJE);
    assert.equal(idx.get('setor:2')?.preco_m2, 100);
    assert.equal(idx.has('lote:1'), false);
  });

  test('cascata sobe Lote → Parcelamento → Setor', () => {
    const idx = indexarPropostas([prop('setor', 2, 100), prop('parcelamento', 46, 200), prop('lote', 1, 300)], HOJE);
    assert.equal(vigentePorCascata(idx, 1, 46, 2)?.preco_m2, 300);
    assert.equal(vigentePorCascata(idx, 9, 46, 2)?.preco_m2, 200);
    assert.equal(vigentePorCascata(idx, 9, 99, 2)?.preco_m2, 100);
    assert.equal(vigentePorCascata(idx, 9, 99, 9), null);
  });
});

describe('agregarImoveis', () => {
  const vigentes = indexarPropostas([prop('setor', 2, 100), prop('parcelamento', 46, 200)], HOJE);
  const setorPorParcelamento = new Map([[46, 2]]);

  test('conjunto vazio devolve tudo zerado', () => {
    const a = agregarImoveis([]);
    assert.equal(a.quantidade, 0);
    assert.equal(a.vgv, 0);
    assert.equal(a.areaPrivativa, null);
  });

  test('VGV usa a proposta do parcelamento quando o lote não tem própria', () => {
    const a = agregarImoveis([lote(1, 100), lote(2, 50)], { vigentes, setorPorParcelamento });
    assert.equal(a.vgv, 200 * 150);
    assert.equal(a.comValor, 2);
    assert.equal(a.areaTotal, 150);
  });

  test('preço de contrato do imóvel sobrepõe a proposta no VGV', () => {
    const dadosPorImovel = new Map([[chaveImovel(1, 'lote'), { preco_estatico: 500 }]]);
    const a = agregarImoveis([lote(1, 100), lote(2, 100)], { vigentes, setorPorParcelamento, dadosPorImovel });
    assert.equal(a.vgv, 500 * 100 + 200 * 100);
  });

  test('lote SEM PREÇO fica fora do VGV e aparece no contador — não some', () => {
    const a = agregarImoveis([lote(1, 100), { id: 2, parcelamento_id: 99, area: 50, area_efetiva: 50 }],
      { vigentes, setorPorParcelamento });
    assert.equal(a.semPreco, 1);
    assert.equal(a.comValor, 1);
    assert.equal(a.quantidade, 2, 'o lote sem preço continua contado como lote');
  });

  test('lote SEM ÁREA fica fora do VGV e aparece no contador', () => {
    const a = agregarImoveis([lote(1, null), lote(2, 100)], { vigentes, setorPorParcelamento });
    assert.equal(a.semArea, 1);
    assert.equal(a.comValor, 1);
    assert.equal(a.vgv, 200 * 100);
  });

  test('preço ZERO entra no VGV — é valor, não ausência', () => {
    const dadosPorImovel = new Map([[chaveImovel(1, 'lote'), { preco_estatico: 0 }]]);
    const a = agregarImoveis([lote(1, 100)], { vigentes, setorPorParcelamento, dadosPorImovel });
    assert.equal(a.semPreco, 0);
    assert.equal(a.comValor, 1);
    assert.equal(a.vgv, 0);
  });

  test('MATRÍCULA-MÃE COMPARTILHADA não infla a área', () => {
    // Dois lotes sem área própria, herdando a MESMA matrícula de 1.000 m².
    const irmaos = [
      { id: 1, parcelamento_id: 46, area: null, area_efetiva: 1000, matricula_id: 77 },
      { id: 2, parcelamento_id: 46, area: null, area_efetiva: 1000, matricula_id: 77 },
    ];
    const a = agregarImoveis(irmaos, { vigentes, setorPorParcelamento });
    assert.equal(a.areaTotal, 1000, 'a área do conjunto é contada uma vez');
    assert.equal(a.areasDeduplicadas, 1);
  });

  test('matrículas diferentes somam normalmente', () => {
    const a = agregarImoveis([
      { id: 1, parcelamento_id: 46, area: null, area_efetiva: 1000, matricula_id: 77 },
      { id: 2, parcelamento_id: 46, area: null, area_efetiva: 500, matricula_id: 88 },
    ], { vigentes, setorPorParcelamento });
    assert.equal(a.areaTotal, 1500);
    assert.equal(a.areasDeduplicadas, 0);
  });

  test('área PRÓPRIA nunca é deduplicada, mesmo com matrícula repetida', () => {
    // Aqui a área é do lote, não da matrícula — somar as duas está certo.
    const a = agregarImoveis([
      { id: 1, parcelamento_id: 46, area: 300, area_efetiva: 300, matricula_id: 77 },
      { id: 2, parcelamento_id: 46, area: 400, area_efetiva: 400, matricula_id: 77 },
    ], { vigentes, setorPorParcelamento });
    assert.equal(a.areaTotal, 700);
    assert.equal(a.areasDeduplicadas, 0);
  });

  test('todos sem preço: VGV zero, mas comValor zero também — o denominador denuncia', () => {
    const a = agregarImoveis([lote(1, 100), lote(2, 100)], {});
    assert.equal(a.vgv, 0);
    assert.equal(a.comValor, 0);
    assert.equal(a.semPreco, 2);
  });
});

describe('somarAgregados', () => {
  test('o Setor soma os parcelamentos sem revarrer os lotes', () => {
    const a = agregarImoveis([{ id: 1, parcelamento_id: 46, area: 100, area_efetiva: 100 }],
      { vigentes: indexarPropostas([{ nivel: 'parcelamento', ref_id: 46, preco_m2: 10, status_aprovacao: 'aprovada', data_proposta: '2026-01-01', data_fim_vigencia: '2026-12-31' }], HOJE) });
    const total = somarAgregados([a, a]);
    assert.equal(total.quantidade, 2);
    assert.equal(total.vgv, a.vgv * 2);
    assert.equal(total.areaTotal, 200);
  });

  test('lista vazia devolve zerado', () => {
    assert.equal(somarAgregados([]).quantidade, 0);
  });
});
