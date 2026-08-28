import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// O importador é ferramenta de operação em `.mjs`, fora do tsconfig do app. As
// funções puras são exportadas de lá justamente para este teste: sem ele, a
// única prova de que o script funciona seria rodá-lo sobre a base viva — 6 mil
// linhas contra a instância. Os tipos vêm de `importar-planilhao.d.mts`.
import {
  slugify,
  soDigitos,
  normalizarArea,
  normalizarPreco,
  casaComChave,
  parseCsv,
  temTransacaoPendente,
  ENDPOINTS,
} from '../../scripts/importar-planilhao.mjs';

describe('casaComChave — a guarda contra filtro que o Núcleo ignora', () => {
  test('registro que casa é aceito', () => {
    assert.equal(casaComChave({ slug: 'boa_vista', id: 3 }, { slug: 'boa_vista' }), true);
  });

  test('registro que NÃO casa é recusado — o filtro foi ignorado', () => {
    // Este é o caso perigoso: o Núcleo descarta filtro fora da allowlist SEM
    // erro, então `dados[0]` seria um registro qualquer.
    assert.equal(casaComChave({ slug: 'outro_lugar' }, { slug: 'boa_vista' }), false);
  });

  test('compara como string — id numérico do Núcleo casa com filtro textual', () => {
    assert.equal(casaComChave({ parcelamento_id: 46 }, { parcelamento_id: '46' }), true);
  });

  test('vazio casa com ausente: conjunto em branco é o caso comum do Planilhão', () => {
    assert.equal(casaComChave({ conjunto: null }, { conjunto: '' }), true);
    assert.equal(casaComChave({ conjunto: '' }, { conjunto: null }), true);
  });

  test('vazio NÃO casa com preenchido', () => {
    assert.equal(casaComChave({ conjunto: 'A' }, { conjunto: '' }), false);
    assert.equal(casaComChave({ conjunto: '' }, { conjunto: 'A' }), false);
  });

  test('chave composta exige TODOS os campos', () => {
    const chave = { parcelamento_id: 46, quadra: 'B', numero_lote: '1' };
    assert.equal(casaComChave({ parcelamento_id: 46, quadra: 'B', numero_lote: '1' }, chave), true);
    // Um campo diferente já invalida — é o que impede pendurar dado no lote errado.
    assert.equal(casaComChave({ parcelamento_id: 46, quadra: 'B', numero_lote: '2' }, chave), false);
  });

  test('nulo ou indefinido nunca casa', () => {
    assert.equal(casaComChave(null, { slug: 'x' }), false);
    assert.equal(casaComChave(undefined, { slug: 'x' }), false);
  });
});

describe('o caminho de pessoas físicas leva BARRA, não hífen', () => {
  test('é /pessoas/fisicas — com hífen tomava 404 em toda linha', () => {
    // No Núcleo o caminho é /pessoas/fisicas para o Express não resolver como
    // /pessoas/:id com id='fisicas'. A versão anterior generalizou o hífen dos
    // outros recursos e nenhuma pessoa era importada.
    assert.equal(ENDPOINTS.pessoas_fisicas, '/nucleo/pessoas/fisicas');
    assert.equal(ENDPOINTS.setores, '/nucleo/setores-habitacionais');
  });
});

describe('normalizarPreco', () => {
  test('formato brasileiro e formato simples', () => {
    assert.equal(normalizarPreco('1.234,56'), 1234.56);
    assert.equal(normalizarPreco('300'), 300);
    assert.equal(normalizarPreco('R$ 1.008,85'), 1008.85);
  });
  test('vazio é null, não zero — zero é preço legítimo', () => {
    assert.equal(normalizarPreco(''), null);
    assert.equal(normalizarPreco(null), null);
    assert.equal(normalizarPreco('   '), null);
    assert.equal(normalizarPreco('0'), 0);
  });
  test('lixo e negativo são null', () => {
    assert.equal(normalizarPreco('a combinar'), null);
    assert.equal(normalizarPreco('-5'), null);
  });
});

describe('temTransacaoPendente', () => {
  test('status do Planilhão que mapeia para transação', () => {
    for (const v of ['Contratado', 'CP', 'vendido', 'ESCRITURADO']) {
      assert.equal(temTransacaoPendente({ Status: v }), true, v);
    }
  });
  test('vazio e desconhecido não viram pendência', () => {
    assert.equal(temTransacaoPendente({ Status: '' }), false);
    assert.equal(temTransacaoPendente({}), false);
    assert.equal(temTransacaoPendente({ Status: 'Disponível' }), false);
  });
});

describe('slugify e utilidades', () => {
  test('acento sai, espaço vira underscore', () => {
    assert.equal(slugify('Pôr do Sol'), 'por_do_sol');
    assert.equal(slugify('Grande Colorado'), 'grande_colorado');
  });
  test('slug não começa com dígito — CREATE SCHEMA quebraria', () => {
    assert.equal(slugify('3 Marias'), 's3_marias');
  });
  test('soDigitos', () => {
    assert.equal(soDigitos('099.775.791-48'), '09977579148');
  });
});

describe('normalizarArea — vazio é null, NUNCA zero', () => {
  test('formato brasileiro', () => {
    assert.equal(normalizarArea('1.008,85'), 1008.85);
    assert.equal(normalizarArea('194,82'), 194.82);
  });

  test('vazio devolve null', () => {
    // `Number('')` é 0, e a versão anterior deixava passar. Área 0 no Núcleo
    // significa "tem área própria, e ela é zero" — o que desliga a dedupe de
    // matrícula-mãe no agregado e infla a área do parcelamento. Um zero
    // importado aqui reintroduz pelo DADO o defeito que o código conserta.
    assert.equal(normalizarArea(''), null);
    assert.equal(normalizarArea('   '), null);
    assert.equal(normalizarArea(null), null);
    assert.equal(normalizarArea(undefined), null);
  });

  test('zero explícito continua sendo zero', () => {
    assert.equal(normalizarArea('0'), 0);
  });

  test('lixo e negativo são null', () => {
    assert.equal(normalizarArea('sem medição'), null);
    assert.equal(normalizarArea('-3'), null);
  });
});

describe('parseCsv', () => {
  test('aspas, vírgula dentro de campo e linha vazia', () => {
    const linhas = parseCsv('a,b\n1,"x, y"\n\n2,z\n');
    assert.equal(linhas.length, 2);
    assert.equal(linhas[0].b, 'x, y');
    assert.equal(linhas[1].a, '2');
  });
});
