import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { upsertPorChave } from '../upsert.js';

/**
 * Helper de dados falso. Guarda as linhas numa lista e simula o índice único:
 * `criar` com uma chave já presente lança o `23505` do Postgres, como o banco
 * faria com a segunda de duas requisições simultâneas.
 *
 * `atrasarPrimeiraLeitura` reproduz a corrida de verdade: a primeira busca
 * acontece ANTES do concorrente inserir, então ela não acha nada e o caminho
 * segue para o `criar` — que perde.
 */
function helperFalso(opcoes: { concorrentePosterior?: Record<string, any> } = {}) {
  const linhas: Record<string, any>[] = [];
  let proximoId = 1;
  let leituras = 0;

  const casa = (linha: Record<string, any>, chave: Record<string, unknown>) =>
    Object.entries(chave).every(([k, v]) => linha[k] === v);

  const helper: any = {
    linhas,
    async listar(_tabela: string, { filtros }: any) {
      leituras += 1;
      // O concorrente insere DEPOIS da nossa primeira leitura: é essa janela
      // que a transação não fecha.
      if (leituras === 1 && opcoes.concorrentePosterior) {
        linhas.push({ id: proximoId++, ...opcoes.concorrentePosterior });
        return { dados: [] };
      }
      return { dados: linhas.filter((l) => casa(l, filtros)) };
    },
    async criar(_tabela: string, dados: Record<string, any>) {
      const chaves = Object.keys(dados).filter((k) => k === 'parcelamento_id' || k === 'imovel_id' || k === 'imovel_tipo');
      const conflito = linhas.find((l) => chaves.every((k) => l[k] === dados[k]));
      if (conflito) {
        const err: any = new Error('duplicate key value violates unique constraint');
        err.code = '23505';
        throw err;
      }
      const nova = { id: proximoId++, ...dados };
      linhas.push(nova);
      return nova;
    },
    async atualizar(_tabela: string, id: number, dados: Record<string, any>) {
      const alvo = linhas.find((l) => l.id === id);
      if (!alvo) return null;
      Object.assign(alvo, dados);
      return alvo;
    },
    async transaction(cb: (trx: any) => Promise<any>) {
      return cb(helper);
    },
  };
  return helper;
}

describe('upsertPorChave', () => {
  test('registro inexistente → cria com a chave junto', async () => {
    const dados = helperFalso();
    const salvo = await upsertPorChave(dados, {
      tabela: 'parcelamento_dados',
      chave: { parcelamento_id: 7 },
      dados: { numero_decreto: '123' },
    });
    assert.equal(salvo?.parcelamento_id, 7);
    assert.equal(salvo?.numero_decreto, '123');
    assert.equal(dados.linhas.length, 1);
  });

  test('registro existente → atualiza, sem duplicar', async () => {
    const dados = helperFalso();
    await upsertPorChave(dados, {
      tabela: 'parcelamento_dados',
      chave: { parcelamento_id: 7 },
      dados: { numero_decreto: '123' },
    });
    const salvo = await upsertPorChave(dados, {
      tabela: 'parcelamento_dados',
      chave: { parcelamento_id: 7 },
      dados: { numero_decreto: '456' },
    });
    assert.equal(salvo?.numero_decreto, '456');
    assert.equal(dados.linhas.length, 1);
  });

  test('perder a corrida do INSERT não é erro: relê e atualiza o registro do concorrente', async () => {
    // O concorrente cria `{parcelamento_id: 7}` logo depois da nossa leitura.
    const dados = helperFalso({ concorrentePosterior: { parcelamento_id: 7, numero_decreto: 'do concorrente' } });
    const salvo = await upsertPorChave(dados, {
      tabela: 'parcelamento_dados',
      chave: { parcelamento_id: 7 },
      dados: { numero_decreto: 'meu' },
    });
    // Uma linha só, e o dado que o usuário mandou é o que ficou.
    assert.equal(dados.linhas.length, 1);
    assert.equal(salvo?.numero_decreto, 'meu');
  });

  test('chave composta de imovel_dados também casa na releitura', async () => {
    const dados = helperFalso({ concorrentePosterior: { imovel_id: 42, imovel_tipo: 'lote', preco_m2_manual: 1 } });
    const salvo = await upsertPorChave(dados, {
      tabela: 'imovel_dados',
      chave: { imovel_id: 42, imovel_tipo: 'lote' },
      dados: { preco_m2_manual: 99 },
    });
    assert.equal(dados.linhas.length, 1);
    assert.equal(salvo?.preco_m2_manual, 99);
  });

  test('erro que NÃO é violação de único sobe — não vira releitura silenciosa', async () => {
    const dados = helperFalso();
    dados.criar = async () => {
      const err: any = new Error('conexão perdida');
      err.code = '08006';
      throw err;
    };
    await assert.rejects(
      () => upsertPorChave(dados, {
        tabela: 'parcelamento_dados',
        chave: { parcelamento_id: 7 },
        dados: { numero_decreto: '123' },
      }),
      /conexão perdida/,
    );
  });
});
