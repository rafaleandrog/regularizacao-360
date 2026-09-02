import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  estadoDaLista,
  numeroLido,
  SUBMENSAGEM_FALHA,
  TEXTO_AUSENCIA,
  sufixoNumerosAntigos,
  badgeOuAvisoDeFalha,
} from '../../comum/estado-lista.js';

describe('estadoDaLista — "nenhum X" é afirmação, e só vale depois de ler', () => {
  const FRASES = { vazio: 'Nenhuma ação neste imóvel' };

  // O defeito real, repetido em seis telas: no `catch` a lista fica vazia e a
  // flag de "carregando" volta a `false`, então o estado vazio renderiza a
  // mesma frase que renderizaria para um imóvel que de fato não tem ação.
  test('lista vazia por falha não diz a frase de vazio', () => {
    const r = estadoDaLista('falhou', FRASES);
    assert.notEqual(r.mensagem, FRASES.vazio);
    assert.equal(r.podeAfirmarVazio, false);
  });

  test('lista vazia durante a leitura também não diz', () => {
    const r = estadoDaLista('correndo', FRASES);
    assert.notEqual(r.mensagem, FRASES.vazio);
    assert.equal(r.podeAfirmarVazio, false);
  });

  test('só a leitura concluída autoriza a frase', () => {
    const r = estadoDaLista('concluida', FRASES);
    assert.equal(r.mensagem, FRASES.vazio);
    assert.equal(r.podeAfirmarVazio, true);
  });

  test('as três mensagens são distintas entre si', () => {
    const m = (['correndo', 'falhou', 'concluida'] as const).map((e) => estadoDaLista(e, FRASES).mensagem);
    assert.equal(new Set(m).size, 3, 'dois estados com a mesma frase apagam a distinção');
  });

  // A submensagem é o que impede o leitor de concluir, do "não foi possível
  // carregar" sozinho, que provavelmente não havia nada mesmo.
  test('só a falha carrega submensagem, e ela nomeia o que a tela não sabe', () => {
    assert.equal(estadoDaLista('falhou', FRASES).submensagem, SUBMENSAGEM_FALHA);
    assert.equal(estadoDaLista('concluida', FRASES).submensagem, '');
    assert.equal(estadoDaLista('correndo', FRASES).submensagem, '');
  });

  test('as frases de carregando e falhou podem ser sobrescritas por tela', () => {
    const r = estadoDaLista('falhou', { vazio: 'a', carregando: 'b', falhou: 'c' });
    assert.equal(r.mensagem, 'c');
    assert.equal(estadoDaLista('correndo', { vazio: 'a', carregando: 'b' }).mensagem, 'b');
  });
});

describe('numeroLido — zero não lido não é zero', () => {
  // "0 pessoa(s) física(s) no Núcleo" era afirmação sobre a base inteira,
  // feita a partir de um `moradoresTotal` que a falha deixou em 0.
  test('devolve null, não 0, enquanto a leitura não concluiu', () => {
    assert.equal(numeroLido('correndo', 0), null);
    assert.equal(numeroLido('falhou', 0), null);
    assert.notEqual(numeroLido('falhou', 0), 0);
  });

  test('zero lido é um número legítimo e passa', () => {
    assert.equal(numeroLido('concluida', 0), 0);
    assert.equal(numeroLido('concluida', 42), 42);
  });
});

describe('TEXTO_AUSENCIA — "—" afirma "não tem", e só a leitura concluída pode afirmar', () => {
  // A data de assinatura era o exemplo real: `—` enquanto a leitura corria ou
  // falhava dizia "não assinou" para um imóvel que pode ter assinado sim.
  test('correndo e falhou dizem "não sei" (…), nunca "não tem" (—)', () => {
    assert.equal(TEXTO_AUSENCIA.correndo, '…');
    assert.equal(TEXTO_AUSENCIA.falhou, '…');
  });

  test('só concluída autoriza a afirmação de ausência', () => {
    assert.equal(TEXTO_AUSENCIA.concluida, '—');
  });

  test('os três símbolos não colapsam num só valor', () => {
    const s = new Set(Object.values(TEXTO_AUSENCIA));
    assert.equal(s.size, 2, 'correndo e falhou compartilham "…" de propósito — só concluída diverge');
  });
});

describe('sufixoNumerosAntigos — só a falha avisa que o número é de leitura anterior', () => {
  // Duplicado cru em duas telas (lotes globais e moradores) antes deste
  // módulo — cada cópia lia seu próprio estado, sem checagem cruzada.
  test('leitura falhada carrega o sufixo', () => {
    assert.equal(sufixoNumerosAntigos('falhou'), ' (números da leitura anterior)');
  });

  test('correndo e concluída não carregam sufixo nenhum', () => {
    assert.equal(sufixoNumerosAntigos('correndo'), '');
    assert.equal(sufixoNumerosAntigos('concluida'), '');
  });
});

describe('badgeOuAvisoDeFalha — o aviso de falha vence o badge normal, por construção', () => {
  const BADGE_NORMAL = { cor: 'padrao', rotulo: 'Em cartório' };
  const AVISO_FALHA = { cor: 'erro', rotulo: 'Transações não lidas' };

  // O defeito real: reordenar um `if (disponivel && falhou) return aviso; else
  // return badgeNormal` escrito à mão não quebra teste nenhum — a prioridade
  // vive só na ordem do código. Aqui a prioridade é o próprio corpo da função.
  test('leitura falhada e recurso disponível: o aviso vence MESMO com badge normal presente', () => {
    const b = badgeOuAvisoDeFalha(true, 'falhou', BADGE_NORMAL, AVISO_FALHA);
    assert.deepEqual(b, AVISO_FALHA);
    assert.notDeepEqual(b, BADGE_NORMAL);
  });

  test('recurso indisponível: o aviso de leitura não se aplica, mesmo com falhou', () => {
    assert.deepEqual(badgeOuAvisoDeFalha(false, 'falhou', BADGE_NORMAL, AVISO_FALHA), BADGE_NORMAL);
  });

  test('leitura correndo ou concluída: passa o badge normal adiante, `null` incluso', () => {
    assert.deepEqual(badgeOuAvisoDeFalha(true, 'correndo', BADGE_NORMAL, AVISO_FALHA), BADGE_NORMAL);
    assert.equal(badgeOuAvisoDeFalha(true, 'concluida', null, AVISO_FALHA), null);
  });
});
