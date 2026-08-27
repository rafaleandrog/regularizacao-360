/**
 * Upsert por chave natural, à prova da corrida (reg360).
 *
 * Duas tabelas do app têm um registro por objeto do Núcleo — `parcelamento_dados`
 * (por parcelamento) e `imovel_dados` (por imóvel) — e ambas nascem na primeira
 * edição. O padrão ingênuo é `listar` e então `criar` ou `atualizar`.
 *
 * **Envolver isso numa transação não fecha a janela.** Um `SELECT` comum não
 * trava linha que ainda não existe, então duas requisições simultâneas podem
 * as duas não achar nada e as duas tentarem inserir. A segunda espera no índice
 * único e falha com violação — e o usuário vê um 422 com mensagem de banco em
 * vez de ver o seu dado salvo.
 *
 * A cura é assumir a corrida: perder o INSERT é resposta esperada, não erro.
 * Quem perde relê e atualiza.
 */

/** Códigos e mensagens de violação de único, conforme o driver os entrega. */
function ehViolacaoDeUnico(err: any): boolean {
  if (!err) return false;
  // Postgres: 23505 unique_violation. O framework pode embrulhar o erro, então
  // o código é checado na causa também.
  if (err.code === '23505' || err.cause?.code === '23505') return true;
  const msg = String(err.message ?? '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('unique constraint') || msg.includes('violat');
}

export interface OpcoesUpsert {
  tabela: string;
  /** Colunas que identificam o registro — o único da tabela. */
  chave: Record<string, unknown>;
  /** Campos a gravar (sem a chave; ela entra sozinha na criação). */
  dados: Record<string, unknown>;
}

/**
 * Cria ou atualiza o registro identificado por `chave`.
 *
 * Perder a corrida do INSERT não é falha: relê e atualiza o registro que o
 * concorrente acabou de criar. Uma tentativa só de recuperação — se a segunda
 * leitura também não achar, o erro é outro e sobe.
 */
export async function upsertPorChave(
  dadosHelper: any,
  { tabela, chave, dados }: OpcoesUpsert,
): Promise<Record<string, any> | null> {
  const buscar = async (helper: any) => {
    const { dados: linhas } = await helper.listar(tabela, { filtros: chave, por_pagina: 1 });
    return linhas?.[0] ?? null;
  };

  try {
    return await dadosHelper.transaction(async (trx: any) => {
      const atual = await buscar(trx);
      if (atual) return trx.atualizar(tabela, Number(atual.id), dados);
      return trx.criar(tabela, { ...dados, ...chave });
    });
  } catch (err: any) {
    if (!ehViolacaoDeUnico(err)) throw err;
    // Alguém criou o registro entre a nossa leitura e a nossa escrita. O dado
    // que o usuário mandou continua válido — aplica-se sobre o que existe.
    const atual = await buscar(dadosHelper);
    if (!atual) throw err;
    return dadosHelper.atualizar(tabela, Number(atual.id), dados);
  }
}
