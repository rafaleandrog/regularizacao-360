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
  BADGE_FASE_NAO_LIDA,
  textoDadoRegularizacao,
  rotuloMatriculaMae,
  avisoFiltroFase,
  edicaoRegularizacaoLiberada,
  TEXTO_REGULARIZACAO_NAO_LIDA,
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

describe('BADGE_FASE_NAO_LIDA — "irregular" é afirmação jurídica, não default de tela', () => {
  // `faseRegularizacao(undefined)` devolver 'irregular' está CERTO: parcelamento
  // sem linha em parcelamento_dados de fato não começou a regularizar.
  test('sem registro, a fase é irregular — e isso é derivação legítima', () => {
    assert.equal(faseRegularizacao(undefined), 'irregular');
    assert.equal(faseRegularizacao({}), 'irregular');
  });

  // O que estava errado era QUEM perguntava: a tela chamava com o mapa vazio
  // durante a carga (em segundo plano) e depois de falha, e todo parcelamento
  // aparecia como "Irregular".
  test('o badge de não-lida não se confunde com nenhuma fase real', () => {
    const reais = FASES.map((f) => f.rotulo);
    assert.ok(!reais.includes(BADGE_FASE_NAO_LIDA.rotulo));
    assert.notEqual(BADGE_FASE_NAO_LIDA.rotulo, badgeFase('irregular').rotulo);
  });

  test('não-lida é neutra: não veste a cor de nenhuma fase', () => {
    assert.equal(BADGE_FASE_NAO_LIDA.cor, 'padrao');
    assert.notEqual(BADGE_FASE_NAO_LIDA.cor, badgeFase('irregular').cor);
  });
});

describe('textoDadoRegularizacao — "—" só depois de ler', () => {
  // O detalhe fazia `regularizacaoPorParcelamento.get(id) || {}` e formatava o
  // objeto vazio como se fosse o registro real: decreto e áreas saíam `—`
  // mesmo com a carga correndo ou já falhada — afirmação sem base.
  test('correndo e falhou → "…", nunca "—"', () => {
    assert.equal(textoDadoRegularizacao('correndo', 'PROJETO EM ELABORAÇÃO'), '…');
    assert.equal(textoDadoRegularizacao('falhou', 'PROJETO EM ELABORAÇÃO'), '…');
    assert.notEqual(textoDadoRegularizacao('correndo', null), '—');
  });

  test('concluida com valor ausente (null, undefined ou vazio) → "—"', () => {
    assert.equal(textoDadoRegularizacao('concluida', null), '—');
    assert.equal(textoDadoRegularizacao('concluida', undefined), '—');
    assert.equal(textoDadoRegularizacao('concluida', ''), '—');
  });

  test('concluida com valor → passa pelo formatador recebido', () => {
    assert.equal(textoDadoRegularizacao('concluida', 34521, (v) => 'x' + v), 'x34521');
  });

  test('DISTINÇÃO: mesmo valor ausente, "correndo" e "concluida" não se confundem', () => {
    assert.notEqual(textoDadoRegularizacao('correndo', null), textoDadoRegularizacao('concluida', null));
  });
});

describe('rotuloMatriculaMae — referência só fala depois da leitura', () => {
  test('correndo → "…", mesmo com id (a carga pode trazer o matricula_id)', () => {
    assert.equal(rotuloMatriculaMae('correndo', null, 42), '…');
  });

  test('concluida sem id → "—" (o parcelamento realmente não tem matrícula-mãe)', () => {
    assert.equal(rotuloMatriculaMae('concluida', null, null), '—');
  });

  test('concluida com id e sem nome resolvido → "…" (nao_resolvida de rotuloReferencia)', () => {
    assert.equal(rotuloMatriculaMae('concluida', null, 42), '…');
  });

  test('concluida com nome → o nome', () => {
    assert.equal(rotuloMatriculaMae('concluida', 'Matrícula 12.345', 42), 'Matrícula 12.345');
  });

  // A mesma ausência de id significa coisas diferentes conforme o estado da
  // leitura — "correndo" não pode afirmar "não tem" antes de saber se há id.
  test('DISTINÇÃO: "correndo" sem id ≠ "concluida" sem id', () => {
    assert.notEqual(rotuloMatriculaMae('correndo', null, null), rotuloMatriculaMae('concluida', null, null));
  });
});

describe('avisoFiltroFase — filtro que não corta avisa', () => {
  // Sem o aviso, escolher uma fase com a carga pendente mostrava os 60
  // parcelamentos como se todos casassem com o filtro, calado.
  test('correndo e falhou → aviso não vazio, e as duas frases são distintas', () => {
    const correndo = avisoFiltroFase('correndo');
    const falhou = avisoFiltroFase('falhou');
    assert.ok(correndo && correndo.length > 0);
    assert.ok(falhou && falhou.length > 0);
    assert.notEqual(correndo, falhou);
  });

  test('concluida → null, o filtro está de fato cortando', () => {
    assert.equal(avisoFiltroFase('concluida'), null);
  });
});

describe('edicaoRegularizacaoLiberada — editar só com o registro lido', () => {
  // O form de "Editar regularização" nasce dos valores atuais (`atual.x ?? ''`).
  // Com o mapa vazio por carga pendente ou falhada ele nasceria em branco, e
  // salvar gravaria por cima do decreto, da matrícula e das áreas já existentes.
  test('só concluida libera a edição', () => {
    assert.equal(edicaoRegularizacaoLiberada('concluida'), true);
    assert.equal(edicaoRegularizacaoLiberada('correndo'), false);
    assert.equal(edicaoRegularizacaoLiberada('falhou'), false);
  });
});

describe('TEXTO_REGULARIZACAO_NAO_LIDA', () => {
  test('tem as três chaves de EstadoContagem', () => {
    assert.deepEqual(Object.keys(TEXTO_REGULARIZACAO_NAO_LIDA).sort(), ['concluida', 'correndo', 'falhou']);
  });

  test('correndo e falhou têm frases distintas', () => {
    assert.notEqual(TEXTO_REGULARIZACAO_NAO_LIDA.correndo, TEXTO_REGULARIZACAO_NAO_LIDA.falhou);
  });

  test('concluida é null — quem fala ali é o próprio valor lido', () => {
    assert.equal(TEXTO_REGULARIZACAO_NAO_LIDA.concluida, null);
  });
});
