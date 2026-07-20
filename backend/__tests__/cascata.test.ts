import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  soData,
  dentroDaVigencia,
  estaAprovada,
  selecionarVigente,
  montarCadeia,
  apenasEditaveis,
  amanha,
  dentroDaJanelaVencimento,
} from '../../comum/cascata.ts';

// Helper: replica o laço da rota GET /propostas/vigente sobre a cadeia,
// escolhendo a primeira vigente do mais específico ao mais geral.
function resolverCascata(
  cadeia: Array<{ nivel: string; ref_id: number }>,
  propostasPorNivel: Record<string, any[]>,
  ref: string,
): { origem: string | null; vigente: any | null } {
  for (const c of cadeia) {
    const cands = (propostasPorNivel[c.nivel] || []).filter((p) => p.ref_id === c.ref_id);
    const v = selecionarVigente(cands, ref);
    if (v) return { origem: c.nivel, vigente: v };
  }
  return { origem: null, vigente: null };
}

describe('soData', () => {
  test('normaliza Date, ISO e YYYY-MM-DD', () => {
    assert.equal(soData(new Date('2026-07-19T12:00:00Z')), '2026-07-19');
    assert.equal(soData('2026-07-19T00:00:00.000-03:00'), '2026-07-19');
    assert.equal(soData('2026-07-19'), '2026-07-19');
  });
  test('vazio vira null', () => {
    assert.equal(soData(null), null);
    assert.equal(soData(undefined), null);
    assert.equal(soData(''), null);
  });
});

describe('dentroDaVigencia', () => {
  const p = { data_proposta: '2026-07-01', data_fim_vigencia: '2026-07-31' };
  test('dentro do período', () => assert.equal(dentroDaVigencia(p, '2026-07-15'), true));
  test('bordas inclusivas', () => {
    assert.equal(dentroDaVigencia(p, '2026-07-01'), true);
    assert.equal(dentroDaVigencia(p, '2026-07-31'), true);
  });
  test('antes do início (futura) e depois do fim (vencida)', () => {
    assert.equal(dentroDaVigencia(p, '2026-06-30'), false);
    assert.equal(dentroDaVigencia(p, '2026-08-01'), false);
  });
  test('datas ausentes → false', () => {
    assert.equal(dentroDaVigencia({ data_proposta: null, data_fim_vigencia: '2026-07-31' }, '2026-07-15'), false);
  });
});

describe('estaAprovada', () => {
  test('só quando status_aprovacao === aprovada', () => {
    assert.equal(estaAprovada({ status_aprovacao: 'aprovada' }), true);
    assert.equal(estaAprovada({ status_aprovacao: 'pendente' }), false);
    assert.equal(estaAprovada({}), false);
  });
});

describe('selecionarVigente', () => {
  const ref = '2026-07-15';
  const vigenteAprovada = { id: 1, status_aprovacao: 'aprovada', data_proposta: '2026-07-01', data_fim_vigencia: '2026-07-31' };
  const pendenteVigente = { id: 2, status_aprovacao: 'pendente', data_proposta: '2026-07-05', data_fim_vigencia: '2026-07-31' };
  const aprovadaVencida = { id: 3, status_aprovacao: 'aprovada', data_proposta: '2026-06-01', data_fim_vigencia: '2026-06-30' };

  test('escolhe aprovada e vigente', () => {
    assert.equal(selecionarVigente([vigenteAprovada], ref)?.id, 1);
  });
  test('ignora pendente mesmo dentro do período', () => {
    assert.equal(selecionarVigente([pendenteVigente], ref), null);
  });
  test('ignora aprovada vencida', () => {
    assert.equal(selecionarVigente([aprovadaVencida], ref), null);
  });
  test('entre várias vigentes, vence a de data_proposta mais recente', () => {
    const antiga = { id: 10, status_aprovacao: 'aprovada', data_proposta: '2026-07-01', data_fim_vigencia: '2026-07-31' };
    const recente = { id: 11, status_aprovacao: 'aprovada', data_proposta: '2026-07-10', data_fim_vigencia: '2026-07-31' };
    assert.equal(selecionarVigente([antiga, recente], ref)?.id, 11);
  });
  test('lista vazia → null', () => {
    assert.equal(selecionarVigente([], ref), null);
  });
});

describe('montarCadeia', () => {
  test('unidade com ambos os pais → 3 candidatos, do específico ao geral', () => {
    const c = montarCadeia('unidade', 100, { parcelamento_id: 20, setor_id: 5 });
    assert.deepEqual(c, [
      { nivel: 'unidade', ref_id: 100 },
      { nivel: 'parcelamento', ref_id: 20 },
      { nivel: 'setor', ref_id: 5 },
    ]);
  });
  test('unidade sem pais → só a própria', () => {
    assert.deepEqual(montarCadeia('unidade', 100), [{ nivel: 'unidade', ref_id: 100 }]);
  });
  test('parcelamento com setor → 2 candidatos', () => {
    assert.deepEqual(montarCadeia('parcelamento', 20, { setor_id: 5 }), [
      { nivel: 'parcelamento', ref_id: 20 },
      { nivel: 'setor', ref_id: 5 },
    ]);
  });
  test('setor → 1 candidato', () => {
    assert.deepEqual(montarCadeia('setor', 5), [{ nivel: 'setor', ref_id: 5 }]);
  });
});

describe('apenasEditaveis', () => {
  test('mantém whitelist e descarta campos gerenciados pelo servidor', () => {
    const out = apenasEditaveis({
      titulo: 'T',
      preco_m2: 100,
      status_aprovacao: 'aprovada', // não editável
      id: 9, // não editável
      criado_por_id: 3, // não editável
    });
    assert.deepEqual(out, { titulo: 'T', preco_m2: 100 });
  });
});

describe('amanha', () => {
  test('dia seguinte a uma base', () => {
    assert.equal(amanha('2026-07-19'), '2026-07-20');
  });
  test('vira o mês corretamente', () => {
    assert.equal(amanha('2026-07-31'), '2026-08-01');
  });
});

describe('dentroDaJanelaVencimento (RN-02 / §5.3)', () => {
  const hojeRef = '2026-07-19';
  const limite = '2026-07-20'; // amanhã
  test('vence amanhã → dentro da janela', () => {
    assert.equal(dentroDaJanelaVencimento({ data_fim_vigencia: '2026-07-20' }, hojeRef, limite), true);
  });
  test('vence hoje → dentro da janela', () => {
    assert.equal(dentroDaJanelaVencimento({ data_fim_vigencia: '2026-07-19' }, hojeRef, limite), true);
  });
  test('vence depois de amanhã → fora', () => {
    assert.equal(dentroDaJanelaVencimento({ data_fim_vigencia: '2026-07-21' }, hojeRef, limite), false);
  });
  test('já venceu (ontem) → fora', () => {
    assert.equal(dentroDaJanelaVencimento({ data_fim_vigencia: '2026-07-18' }, hojeRef, limite), false);
  });
  test('sem data → fora', () => {
    assert.equal(dentroDaJanelaVencimento({ data_fim_vigencia: null }, hojeRef, limite), false);
  });
});

describe('cascata (RN-01) — resolução ponta a ponta', () => {
  const ref = '2026-07-15';
  const propostaSetor = { id: 500, nivel: 'setor', ref_id: 5, status_aprovacao: 'aprovada', data_proposta: '2026-01-01', data_fim_vigencia: '2026-12-31' };
  const propostaParc = { id: 300, nivel: 'parcelamento', ref_id: 20, status_aprovacao: 'aprovada', data_proposta: '2026-07-01', data_fim_vigencia: '2026-07-31' };
  const propostaUnid = { id: 100, nivel: 'unidade', ref_id: 100, status_aprovacao: 'aprovada', data_proposta: '2026-07-05', data_fim_vigencia: '2026-07-20' };

  test('unidade com proposta própria vence', () => {
    const cadeia = montarCadeia('unidade', 100, { parcelamento_id: 20, setor_id: 5 });
    const r = resolverCascata(cadeia, { unidade: [propostaUnid], parcelamento: [propostaParc], setor: [propostaSetor] }, ref);
    assert.equal(r.origem, 'unidade');
    assert.equal(r.vigente.id, 100);
  });
  test('sem proposta na unidade, herda do parcelamento', () => {
    const cadeia = montarCadeia('unidade', 100, { parcelamento_id: 20, setor_id: 5 });
    const r = resolverCascata(cadeia, { unidade: [], parcelamento: [propostaParc], setor: [propostaSetor] }, ref);
    assert.equal(r.origem, 'parcelamento');
    assert.equal(r.vigente.id, 300);
  });
  test('sem unidade nem parcelamento vigentes, herda do setor (base sempre presente)', () => {
    const parcVencida = { ...propostaParc, data_fim_vigencia: '2026-07-10' };
    const cadeia = montarCadeia('unidade', 100, { parcelamento_id: 20, setor_id: 5 });
    const r = resolverCascata(cadeia, { unidade: [], parcelamento: [parcVencida], setor: [propostaSetor] }, ref);
    assert.equal(r.origem, 'setor');
    assert.equal(r.vigente.id, 500);
  });
});
