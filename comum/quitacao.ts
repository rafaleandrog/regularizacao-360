/**
 * Quitação do imóvel (reg360) — lógica pura.
 *
 * "Quitado" é **marca, não cálculo**: o saldo devedor vive na base do
 * financeiro, fora do escopo do app. Aqui se registra que alguém constatou a
 * quitação — daí autoria e data andarem sempre juntas com a flag.
 */

/**
 * Campos que **só** as rotas dedicadas podem escrever.
 *
 * Existe porque `salvar()` de `imovel-dados` aceita qualquer objeto: no dia em
 * que entrar um PUT descritivo (issue #20, com `uso`, `tipo_lote`,
 * `observacao`), nada impediria o cliente de mandar `quitado: true` no mesmo
 * corpo e pular o gate de `validador_interno`.
 *
 * A guarda é aqui, e não na rota, para que a próxima rota de escrita a herde
 * sem precisar lembrar dela — a falha desse tipo de regra é ausência, não erro.
 */
export const CAMPOS_SO_POR_ROTA_PROPRIA = [
  'quitado',
  'quitado_em',
  'quitado_por_id',
  'preco_estatico',
  'preco_estatico_em',
  'preco_estatico_por_id',
] as const;

/**
 * Recusa um corpo que tente escrever campo protegido.
 *
 * Devolve `{ erro }` em vez de descartar em silêncio: cliente que manda
 * `quitado` num PUT descritivo está enganado sobre a API, e uma resposta que
 * ignora o campo o deixaria acreditar que gravou.
 */
export function semCamposProtegidos(
  campos: Record<string, unknown>,
): { ok: true } | { erro: string } {
  const invasores = CAMPOS_SO_POR_ROTA_PROPRIA.filter((c) => campos && c in campos);
  if (invasores.length === 0) return { ok: true };
  return {
    erro: `${invasores.join(', ')} não se escreve por aqui — use a rota própria`,
  };
}

export interface Quitacao {
  quitado: boolean;
  em: string | null;
  porNome: string | null;
}

/**
 * Estado de quitação para a tela, a partir do registro de `imovel_dados`.
 *
 * Registro inexistente é o caso NORMAL (a maioria dos imóveis nunca foi
 * editada) e significa não quitado — não "desconhecido".
 */
export function lerQuitacao(dados: any): Quitacao {
  return {
    quitado: Boolean(dados?.quitado),
    em: dados?.quitado_em ?? null,
    porNome: dados?.quitado_por_nome ?? null,
  };
}
