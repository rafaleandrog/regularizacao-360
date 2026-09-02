import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  precoAplicavel,
  valorDoImovel,
  aplicarDescontos,
  respeitaPiso,
  controlesDePreco,
  TEXTO_LEITURA_PRECO,
  TEXTO_LEITURA_CASCATA,
} from '../../comum/preco.js';
import type { LeiturasDoPreco } from '../../comum/preco.js';

describe('precoAplicavel — precedência e origem', () => {
  test('estático vence manual e proposta — é o contrato firmado', () => {
    const r = precoAplicavel({ preco_estatico: 200, preco_m2_manual: 150 }, { preco_m2: 190 });
    assert.deepEqual(r, { valor: 200, origem: 'estatico' });
  });

  test('manual vence a proposta quando não há estático', () => {
    assert.deepEqual(precoAplicavel({ preco_m2_manual: 150 }, { preco_m2: 190 }), { valor: 150, origem: 'manual' });
  });

  test('sem estático nem manual, vale a proposta vigente', () => {
    assert.deepEqual(precoAplicavel({}, { preco_m2: 190 }), { valor: 190, origem: 'proposta' });
  });

  test('sem nada, valor e origem são null — não zero', () => {
    assert.deepEqual(precoAplicavel({}, null), { valor: null, origem: null });
    assert.deepEqual(precoAplicavel(null, null), { valor: null, origem: null });
  });

  test('ZERO é preço legítimo e vence os seguintes', () => {
    // Um contrato de R$ 0,00 é um fato, não um campo vazio.
    assert.deepEqual(precoAplicavel({ preco_estatico: 0 }, { preco_m2: 190 }), { valor: 0, origem: 'estatico' });
  });

  test('string vazia não conta como preço', () => {
    assert.deepEqual(precoAplicavel({ preco_estatico: '' }, { preco_m2: 190 }), { valor: 190, origem: 'proposta' });
  });

  test('decimal vindo do banco como string é aceito', () => {
    assert.deepEqual(precoAplicavel({ preco_estatico: '161.10' }, null), { valor: 161.1, origem: 'estatico' });
  });
});

describe('valorDoImovel — os dois casos das telas do legado', () => {
  test('B Lote 1: proposta vigente 300,00 × 1.008,85 = 302.655,00', () => {
    const p = precoAplicavel({}, { preco_m2: 300 });
    assert.equal(valorDoImovel(p.valor, 1008.85), 302655);
    assert.equal(p.origem, 'proposta');
  });

  test('BS Lote 1: o preço final SOBREPÕE a proposta vigente', () => {
    // A tela mostra proposta 190,00, final 161,10, área 194,82 e valor
    // R$ 31.385,99. O ponto que importa é a SOBREPOSIÇÃO: se a proposta
    // vigente valesse, o valor seria 190 × 194,82 = R$ 37.015,80 — muito longe
    // do exibido.
    const p = precoAplicavel({ preco_estatico: 161.1 }, { preco_m2: 190 });
    assert.equal(p.origem, 'estatico');

    const comFinal = valorDoImovel(p.valor, 194.82)!;
    const comProposta = valorDoImovel(190, 194.82)!;
    assert.ok(Math.abs(comFinal - 31385.99) < 2, `esperado ~31385,99, veio ${comFinal}`);
    assert.ok(Math.abs(comProposta - 31385.99) > 5000, 'a proposta vigente não explica o valor da tela');

    // Por que a tolerância e não igualdade exata: 161,10 × 194,82 = 31.385,50,
    // e a tela diz 31.385,99. Os dois fatores aparecem ARREDONDADOS a 2 casas
    // (o preço real é ~161,1025, ou a área ~194,8230 — `imoveis.area` é
    // numeric(14,4)). Reproduzir o centavo a partir de números já arredondados
    // não é possível, e fingir que é seria um teste que passa por sorte.
  });

  test('sem preço ou sem área devolve null, nunca 0', () => {
    assert.equal(valorDoImovel(null, 100), null);
    assert.equal(valorDoImovel(300, null), null);
    assert.equal(valorDoImovel(300, ''), null);
  });

  test('preço zero com área real dá valor zero — que é diferente de null', () => {
    assert.equal(valorDoImovel(0, 100), 0);
  });
});

describe('aplicarDescontos', () => {
  const proposta = {
    desconto_a_vista: 10,
    desconto_6x: 5,
    desconto_12x: 0,
    desconto_lote_grande: 20,
    lote_grande_m2: 1000,
  };

  test('desconto por forma de pagamento', () => {
    assert.equal(aplicarDescontos(200, proposta, 'a_vista', 500), 180);
    assert.equal(aplicarDescontos(200, proposta, '6x', 500), 190);
    assert.equal(aplicarDescontos(200, proposta, '12x', 500), 200);
  });

  test('lote grande acumula com a forma de pagamento — só acima do mínimo', () => {
    // 200 → 180 (10% à vista) → 144 (20% lote grande)
    assert.equal(aplicarDescontos(200, proposta, 'a_vista', 1200), 144);
    // abaixo do mínimo, só o desconto da forma
    assert.equal(aplicarDescontos(200, proposta, 'a_vista', 999), 180);
  });

  test('exatamente no mínimo já aciona o desconto de lote grande', () => {
    assert.equal(aplicarDescontos(200, proposta, '12x', 1000), 160);
  });

  test('proposta sem descontos devolve o preço intacto', () => {
    assert.equal(aplicarDescontos(200, {}, 'a_vista', 5000), 200);
  });

  test('preço nulo continua nulo', () => {
    assert.equal(aplicarDescontos(null, proposta, 'a_vista', 100), null);
  });

  test('sem área, o desconto de lote grande não é aplicado por suposição', () => {
    assert.equal(aplicarDescontos(200, proposta, '12x', undefined), 200);
  });
});

describe('respeitaPiso — informativo, nunca bloqueio', () => {
  const proposta = { preco_minimo_residencial: 180, preco_minimo_comercial_misto: 250 };

  test('abaixo do piso residencial é sinalizado', () => {
    assert.deepEqual(respeitaPiso(161.1, proposta, 'residencial'), { piso: 180, abaixoDoPiso: true });
  });

  test('acima do piso passa', () => {
    assert.deepEqual(respeitaPiso(200, proposta, 'residencial'), { piso: 180, abaixoDoPiso: false });
  });

  test('cada família olha o seu piso', () => {
    assert.equal(respeitaPiso(200, proposta, 'comercial_misto').abaixoDoPiso, true);
    assert.equal(respeitaPiso(200, proposta, 'residencial').abaixoDoPiso, false);
  });

  test('exatamente no piso não está abaixo', () => {
    assert.equal(respeitaPiso(180, proposta, 'residencial').abaixoDoPiso, false);
  });

  test('família desconhecida NÃO checa — melhor não checar que checar errado', () => {
    // É o estado enquanto o catálogo de Uso (#22) não existe.
    assert.deepEqual(respeitaPiso(10, proposta, null), { piso: null, abaixoDoPiso: false });
  });

  test('proposta sem piso declarado não sinaliza nada', () => {
    assert.deepEqual(respeitaPiso(10, {}, 'residencial'), { piso: null, abaixoDoPiso: false });
  });
});

// ---------------------------------------------------------------------------
// controlesDePreco — o que a tela pode afirmar e oferecer
// ---------------------------------------------------------------------------

describe('controlesDePreco — leitura que não concluiu não vira afirmação nem botão', () => {
  const ADMIN = { podeCriar: true, ehAdmin: true };
  const CRIADOR = { podeCriar: true, ehAdmin: false };
  const LIDO: LeiturasDoPreco = { dados: 'concluida', contexto: 'concluida' };

  // O defeito real: `dadosDoImovel` começa `{}` e assim fica se a requisição
  // falhar. `preco_estatico == null` é verdadeiro pelo motivo errado, a tela
  // oferece "Gravar preço de contrato", e o backend devolve 409
  // REG360_PRECO_ESTATICO_GRAVADO porque o contrato existe.
  test('não oferece "gravar contrato" antes de ler — o botão tomaria 409', () => {
    for (const dados of ['correndo', 'falhou'] as const) {
      const c = controlesDePreco({ dados, contexto: 'concluida' }, {}, ADMIN);
      assert.equal(c.gravarContrato, false, `estado ${dados}`);
      assert.equal(c.definirManual, false, `estado ${dados}`);
      assert.equal(c.corrigirContrato, false, `estado ${dados}`);
      assert.equal(c.limparManual, false, `estado ${dados}`);
    }
  });

  test('lido e sem contrato: aí sim oferece gravar', () => {
    const c = controlesDePreco(LIDO, {}, CRIADOR);
    assert.equal(c.gravarContrato, true);
    assert.equal(c.corrigirContrato, false);
  });

  test('com contrato gravado, gravar dá lugar a corrigir — e corrigir é só do admin', () => {
    const comContrato = { preco_estatico: 200 };
    assert.equal(controlesDePreco(LIDO, comContrato, ADMIN).corrigirContrato, true);
    assert.equal(controlesDePreco(LIDO, comContrato, CRIADOR).corrigirContrato, false);
    assert.equal(controlesDePreco(LIDO, comContrato, ADMIN).gravarContrato, false);
  });

  test('contrato de R$ 0,00 é contrato — zero não é ausência', () => {
    const c = controlesDePreco(LIDO, { preco_estatico: 0 }, ADMIN);
    assert.equal(c.gravarContrato, false);
    assert.equal(c.corrigirContrato, true);
  });

  test('"limpar manual" só com manual gravado', () => {
    assert.equal(controlesDePreco(LIDO, { preco_m2_manual: 10 }, CRIADOR).limparManual, true);
    assert.equal(controlesDePreco(LIDO, {}, CRIADOR).limparManual, false);
  });

  test('sem podeCriar não há botão nenhum, mesmo com tudo lido', () => {
    const c = controlesDePreco(LIDO, { preco_m2_manual: 10 }, { podeCriar: false, ehAdmin: true });
    assert.equal(c.gravarContrato, false);
    assert.equal(c.definirManual, false);
    assert.equal(c.limparManual, false);
    assert.equal(c.corrigirContrato, false);
  });

  // "Não há contrato, preço manual, nem proposta vigente na cascata" é
  // afirmação sobre TRÊS fontes. A terceira depende do contexto: sem o
  // parcelamento resolvido, `resolverVigente` pula os elos de cima.
  test('não afirma "sem preço" enquanto uma das duas leituras não concluiu', () => {
    assert.equal(controlesDePreco({ dados: 'falhou', contexto: 'concluida' }, {}, ADMIN).podeAfirmarSemPreco, false);
    assert.equal(controlesDePreco({ dados: 'concluida', contexto: 'falhou' }, {}, ADMIN).podeAfirmarSemPreco, false);
    assert.equal(controlesDePreco({ dados: 'correndo', contexto: 'correndo' }, {}, ADMIN).podeAfirmarSemPreco, false);
    assert.equal(controlesDePreco(LIDO, {}, ADMIN).podeAfirmarSemPreco, true);
  });

  // O defeito real: "Valor do imóvel" e "Preço final" olhavam só a leitura de
  // `dados` para escolher entre "…" e "—". Com `dados` concluída e `contexto`
  // falhada, `preco` vem `null` porque a cascata pulou elos — não porque as
  // três fontes foram checadas — e o KPI dizia "—" (que por
  // `comum/referencias.ts` significa "não tem") com cara de número apurado.
  describe('marcadorPrecoAusente — KPI de preço que depende das duas leituras', () => {
    test('contexto falhado com dados concluída: ainda é "não sei", não "não tem"', () => {
      const c = controlesDePreco({ dados: 'concluida', contexto: 'falhou' }, {}, ADMIN);
      assert.equal(c.marcadorPrecoAusente, '…');
    });

    test('dados falhada com contexto concluído também é "não sei"', () => {
      const c = controlesDePreco({ dados: 'falhou', contexto: 'concluida' }, {}, ADMIN);
      assert.equal(c.marcadorPrecoAusente, '…');
    });

    test('as duas concluídas: aí sim "não tem"', () => {
      const c = controlesDePreco(LIDO, {}, ADMIN);
      assert.equal(c.marcadorPrecoAusente, '—');
    });

    // Assert de distinção: os dois estados têm que produzir marcadores
    // DIFERENTES — se convergissem, a distinção que este campo existe para
    // fazer teria sumido de volta no valor.
    test('leitura incompleta e leitura completa nunca convergem para o mesmo marcador', () => {
      const incompleto = controlesDePreco({ dados: 'concluida', contexto: 'correndo' }, {}, ADMIN).marcadorPrecoAusente;
      const completo = controlesDePreco(LIDO, {}, ADMIN).marcadorPrecoAusente;
      assert.notEqual(incompleto, completo);
    });

    test('acompanha podeAfirmarSemPreco — mesma leitura decide os dois', () => {
      for (const leituras of [
        { dados: 'concluida', contexto: 'concluida' },
        { dados: 'falhou', contexto: 'concluida' },
        { dados: 'concluida', contexto: 'correndo' },
      ] as LeiturasDoPreco[]) {
        const c = controlesDePreco(leituras, {}, ADMIN);
        assert.equal(c.marcadorPrecoAusente, c.podeAfirmarSemPreco ? '—' : '…');
      }
    });
  });

  test('cada leitura pendente rende um aviso, e as duas concluídas não rendem nenhum', () => {
    assert.equal(controlesDePreco(LIDO, {}, ADMIN).avisos.length, 0);
    assert.equal(controlesDePreco({ dados: 'falhou', contexto: 'concluida' }, {}, ADMIN).avisos.length, 1);
    assert.equal(controlesDePreco({ dados: 'falhou', contexto: 'falhou' }, {}, ADMIN).avisos.length, 2);
  });

  // Sem isto, "carregando" e "falhou" poderiam convergir para a mesma frase, e
  // a distinção que esta função existe para criar sumiria no texto.
  test('os textos das duas leituras distinguem correndo de falhou', () => {
    assert.notEqual(TEXTO_LEITURA_PRECO.correndo, TEXTO_LEITURA_PRECO.falhou);
    assert.notEqual(TEXTO_LEITURA_CASCATA.correndo, TEXTO_LEITURA_CASCATA.falhou);
    assert.equal(TEXTO_LEITURA_PRECO.concluida, null);
    assert.equal(TEXTO_LEITURA_CASCATA.concluida, null);
  });
});
