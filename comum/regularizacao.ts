/**
 * Duas classificações do Parcelamento, independentes entre si (reg360).
 *
 * **Fase de regularização** — derivada das datas, nunca persistida. Avalia na
 * ordem inversa, do estágio mais avançado para o mais inicial; o primeiro campo
 * preenchido determina a fase.
 *
 * **Situação registral** — campo próprio, ORTOGONAL à fase. Um parcelamento
 * pode estar Aprovado *e* Caucionado ao mesmo tempo, e por isso são dois eixos
 * em vez de cinco estados numa fila só. A tela do legado misturava os dois
 * numa faixa de chips; separar aqui evita que marcar "Caucionado" esconda um
 * parcelamento que também está Aprovado.
 *
 * Há ainda um terceiro sinal, que NÃO é nosso: o `status` que o Núcleo deriva
 * de `data_registro` + `regularizacao` (ver `comum/status-parcelamento.ts`).
 * Ele continua exibido como dado registral de apoio e não compete com a fase.
 *
 * Puro: sem Express, sem Lit. Reusa `soData` de `comum/cascata.ts` — data do
 * framework é string `YYYY-MM-DD`, e embrulhar em `new Date()` desloca o dia
 * pelo fuso.
 */

import { soData } from './cascata.js';

export type FaseRegularizacao = 'irregular' | 'em_analise' | 'aprovado' | 'registrado';
export type SituacaoRegistral = 'nenhuma' | 'caucionado' | 'prenotado';

export interface OpcaoRotulada {
  id: string;
  rotulo: string;
  cor: string;
}

/**
 * Ordem de exibição: do mais inicial ao mais avançado. A avaliação é a
 * inversa — ver `faseRegularizacao`.
 *
 * Fonte única: os chips de filtro e o select do formulário saem daqui, nunca
 * de array literal na tela. Fase nova aparece nos dois lugares sozinha.
 */
export const FASES: readonly OpcaoRotulada[] = [
  { id: 'irregular', rotulo: 'Irregular', cor: 'perigo' },
  { id: 'em_analise', rotulo: 'Em análise', cor: 'alerta' },
  { id: 'aprovado', rotulo: 'Aprovado', cor: 'info' },
  { id: 'registrado', rotulo: 'Registrado', cor: 'sucesso' },
];

export const SITUACOES_REGISTRAIS: readonly OpcaoRotulada[] = [
  { id: 'nenhuma', rotulo: 'Nenhuma', cor: 'padrao' },
  { id: 'caucionado', rotulo: 'Caucionado', cor: 'alerta' },
  { id: 'prenotado', rotulo: 'Prenotado', cor: 'info' },
];

/** Colunas que o cliente pode enviar ao editar os dados de regularização. */
export const CAMPOS_EDITAVEIS_PARCELAMENTO = [
  'numero_decreto',
  'matricula_id',
  'area_poligonal',
  'area_viario',
  'area_servidao',
  'data_envio_projeto',
  'data_aprovacao_conplan',
  'data_decreto_gdf',
  'situacao_registral',
  'observacao',
] as const;

/** Colunas de data que decidem a fase, do estágio mais avançado ao mais inicial. */
const DATAS_DA_FASE: ReadonlyArray<[campo: string, fase: FaseRegularizacao]> = [
  ['data_decreto_gdf', 'registrado'],
  ['data_aprovacao_conplan', 'aprovado'],
  ['data_envio_projeto', 'em_analise'],
];

/**
 * A fase do parcelamento. Ordem INVERSA: com as três datas preenchidas o
 * resultado é `registrado`, não `em_analise` — o estágio mais avançado vence.
 *
 * Registro ausente (parcelamento que nunca foi editado) é `irregular`, não
 * erro: é o estado inicial legítimo de todo parcelamento.
 */
export function faseRegularizacao(dados: any): FaseRegularizacao {
  for (const [campo, fase] of DATAS_DA_FASE) {
    if (soData(dados?.[campo])) return fase;
  }
  return 'irregular';
}

function acharOpcao(lista: readonly OpcaoRotulada[], id: unknown): OpcaoRotulada | null {
  const chave = String(id ?? '').trim().toLowerCase();
  return lista.find((o) => o.id === chave) ?? null;
}

/**
 * Rótulo e cor da fase. Valor desconhecido volta cru em cor neutra, nunca
 * mapeado por aproximação — mesma disciplina de `badgeStatusParcelamento`,
 * onde casar por substring fazia `nao_registrado` virar "Registrado".
 */
export function badgeFase(fase: unknown): OpcaoRotulada {
  return acharOpcao(FASES, fase) ?? { id: String(fase ?? ''), rotulo: String(fase ?? '—'), cor: 'padrao' };
}

export function badgeSituacaoRegistral(situacao: unknown): OpcaoRotulada {
  return acharOpcao(SITUACOES_REGISTRAIS, situacao) ?? { id: String(situacao ?? ''), rotulo: String(situacao ?? '—'), cor: 'padrao' };
}

/** Situação registral só merece badge quando é exceção — "nenhuma" não é. */
export function situacaoRegistralRelevante(situacao: unknown): boolean {
  const chave = String(situacao ?? '').trim().toLowerCase();
  return chave !== '' && chave !== 'nenhuma';
}

/** Extrai apenas os campos editáveis de um objeto (whitelist). */
export function apenasEditaveisParcelamento(fonte: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS_PARCELAMENTO) {
    if (fonte != null && fonte[campo] !== undefined) out[campo] = fonte[campo];
  }
  return out;
}
