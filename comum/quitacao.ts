/**
 * Quitação do imóvel (reg360) — lógica pura.
 *
 * "Quitado" é **marca, não cálculo**: o saldo devedor vive na base do
 * financeiro, fora do escopo do app. Aqui se registra que alguém constatou a
 * quitação — daí autoria e data andarem sempre juntas com a flag.
 */

import type { EstadoContagem } from './agregados.js';

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

// ---------------------------------------------------------------------------
// Quitação × estado da leitura
// ---------------------------------------------------------------------------

/**
 * Quitação com o estado da LEITURA embutido — quatro estados, não dois.
 *
 * `lerQuitacao` responde a pergunta certa ("o registro diz quitado?") e não
 * tem como responder a anterior: **houve registro para ler?** Com
 * `dadosDoImovel` ainda em voo, ou depois de uma requisição que falhou, o
 * objeto é `{}` — e `Boolean(undefined)` é `false`, indistinguível de um
 * imóvel que realmente não está quitado.
 *
 * O custo disso não é cosmético: o badge "Quitado" **some** de um imóvel
 * quitado, e o botão oferecido passa a ser "Marcar como quitado" para quem já
 * está. Mesma família de defeito que `estadoDosOcupantes` e
 * `estadoDaContagem` cobrem nos seus recortes.
 */
export type EstadoQuitacao = 'nao_lida' | 'falhou' | 'quitado' | 'nao_quitado';

export function estadoDaQuitacao(leitura: EstadoContagem, dados: any): EstadoQuitacao {
  // Falha vence: quem falha deixa `dadosDoImovel` em `{}`, e perguntar só ao
  // objeto devolveria "não quitado" com a mesma cara de um fato apurado.
  if (leitura === 'falhou') return 'falhou';
  if (leitura === 'correndo') return 'nao_lida';
  return lerQuitacao(dados).quitado ? 'quitado' : 'nao_quitado';
}

/**
 * A frase dos estados em que **não há marca a exibir**. `null` nos dois
 * estados apurados: ali quem fala é o badge (ou o silêncio dele, que aí
 * significa mesmo "não quitado").
 */
export const TEXTO_QUITACAO: Record<EstadoQuitacao, string | null> = {
  nao_lida: 'Quitação: consultando…',
  falhou: 'Quitação: não foi possível ler',
  quitado: null,
  nao_quitado: null,
};

/**
 * O controle de quitar/desquitar pode aparecer?
 *
 * Não quando a leitura não concluiu: o botão exibido seria escolhido pelo
 * estado errado — oferecer "Marcar como quitado" a um imóvel já quitado é
 * pedir ao usuário que confirme uma coisa que a tela não sabe.
 */
export function podeAlternarQuitacao(estado: EstadoQuitacao): boolean {
  return estado === 'quitado' || estado === 'nao_quitado';
}
