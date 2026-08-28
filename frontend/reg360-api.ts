import { urbiVerso } from './reg360-env.js';
import * as nucleo from './nucleo-cliente.js';
import { proximaPagina } from '../comum/paginacao.js';

/**
 * Cliente de API do reg360.
 *  - Rotas da app via `urbiVerso.api('/...')` (slug reg360 injetado).
 *  - Leituras do Núcleo via `nucleo-cliente` (pagina em laço, memoriza por
 *    sessão e distingue flag desligada de lista vazia).
 */

function qs(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return '';
  const limpo: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') limpo[k] = String(v);
  }
  const s = new URLSearchParams(limpo).toString();
  return s ? `?${s}` : '';
}

const JSON_POST = (corpo?: unknown, method = 'POST') => ({
  method,
  ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  headers: { 'Content-Type': 'application/json' },
});

export interface Proposta {
  id: number;
  titulo: string;
  descricao?: string;
  nivel: 'setor' | 'parcelamento' | 'lote' | 'unidade';
  tipo_proposta: 'tabela' | 'campanha' | 'negociacao_coletiva';
  ref_id: number;
  data_proposta: string;
  data_fim_vigencia: string;
  status_aprovacao: 'pendente' | 'aprovada';
  criado_por_id?: number | null;
  criador_nome?: string | null;
  aprovado_por_id?: number | null;
  aprovador_nome?: string | null;
  preco_m2: number;
  preco_minimo_residencial?: number | null;
  preco_minimo_comercial_misto?: number | null;
  desconto_a_vista?: number | null;
  desconto_6x?: number | null;
  desconto_12x?: number | null;
  desconto_lote_grande?: number | null;
  lote_grande_m2?: number | null;
}

export interface Acao {
  id: number;
  tipo: 'revisional' | 'obrigacao_de_fazer' | 'outra';
  polo: 'up_contra' | 'contra_up';
  data?: string | null;
  numero_processo?: string | null;
  valor?: number | null;
  descricao?: string | null;
  status: 'ativa' | 'encerrada' | 'suspensa';
  criado_por_id?: number | null;
  criador_nome?: string | null;
  /** Vínculos, que a rota devolve junto — a tela nunca os busca à parte. */
  imoveis?: Array<{ id: number; imovel_id: number; imovel_tipo: string }>;
  pessoas?: Array<{ id: number; pessoa_id: number; papel: string }>;
}

/**
 * Corpo de criação: os vínculos vão JUNTO, e é por isso que ele não é um
 * `Partial<Acao>` — na `Acao` que volta, cada vínculo já tem o seu próprio
 * `id`; aqui ainda não existe nenhum.
 */
export interface NovaAcao {
  tipo: string;
  polo: string;
  data?: string | null;
  numero_processo?: string | null;
  valor?: number | null;
  descricao?: string | null;
  status?: string;
  imoveis?: Array<{ imovel_id: number; imovel_tipo: string }>;
  pessoas?: Array<{ pessoa_id: number; papel?: string }>;
}

export interface ListaDados<T> {
  dados: T[];
  total?: number;
  pagina?: number;
  paginas?: number;
}

export const reg360Api = {
  // ---- Propostas (rotas da app) ----
  listarPropostas: (p?: Record<string, string | number>): Promise<ListaDados<Proposta>> =>
    urbiVerso.api(`/propostas${qs(p)}`),
  buscarProposta: (id: number): Promise<Proposta> => urbiVerso.api(`/propostas/${id}`),
  resolverVigente: (p: {
    nivel: string;
    ref_id: number;
    lote_id?: number;
    parcelamento_id?: number;
    setor_id?: number;
  }): Promise<{ vigente: Proposta | null; origem_cascata: string | null }> =>
    urbiVerso.api(`/propostas/vigente${qs(p)}`),
  criarProposta: (corpo: Partial<Proposta>): Promise<Proposta> =>
    urbiVerso.api('/propostas', JSON_POST(corpo)),

  /**
   * Todas as propostas, paginando em laço. O agregado de VGV precisa do
   * conjunto inteiro para resolver a cascata de cada lote sem ir ao servidor
   * uma vez por imóvel.
   */
  listarTodasPropostas: async (): Promise<Proposta[]> => {
    const acumulado: Proposta[] = [];
    let pagina: number | null = 1;
    while (pagina !== null) {
      const r: any = await urbiVerso.api(`/propostas?pagina=${pagina}&por_pagina=100`);
      acumulado.push(...(r?.dados || []));
      pagina = proximaPagina(r, pagina, acumulado.length);
    }
    return acumulado;
  },
  listarImovelDados: (imovelTipo = 'lote'): Promise<ListaDados<any>> =>
    urbiVerso.api(`/imovel-dados?imovel_tipo=${imovelTipo}`),

  // ---- Dados do imóvel: preços (tabela do app) ----
  imovelDados: (tipo: string, id: number): Promise<any> =>
    urbiVerso.api(`/imovel-dados/${tipo}/${id}`),
  gravarPrecoEstatico: (tipo: string, id: number, preco: number): Promise<any> =>
    urbiVerso.api(`/imovel-dados/${tipo}/${id}/preco-estatico`, JSON_POST({ preco_estatico: preco })),
  corrigirPrecoEstatico: (tipo: string, id: number, preco: number | null): Promise<any> =>
    urbiVerso.api(`/imovel-dados/${tipo}/${id}/preco-estatico/corrigir`, JSON_POST({ preco_estatico: preco })),
  salvarPrecoManual: (tipo: string, id: number, preco: number | null): Promise<any> =>
    urbiVerso.api(`/imovel-dados/${tipo}/${id}/preco-manual`, JSON_POST({ preco_m2_manual: preco }, 'PUT')),
  // Quitação tem rota própria porque tem GATE próprio: é constatação
  // financeira (validador_interno), não cadastro (criador).
  quitarImovel: (tipo: string, id: number): Promise<any> =>
    urbiVerso.api(`/imovel-dados/${tipo}/${id}/quitar`, JSON_POST(undefined)),
  desquitarImovel: (tipo: string, id: number): Promise<any> =>
    urbiVerso.api(`/imovel-dados/${tipo}/${id}/desquitar`, JSON_POST(undefined)),

  // ---- Ações judiciais (tabelas do app) ----
  // Filtro por imóvel exige os DOIS campos: `imovel_id` sozinho devolveria as
  // ações do lote 5 E da unidade 5 — objetos diferentes com o mesmo número.
  listarAcoes: (p?: {
    imovel_id?: number;
    imovel_tipo?: string;
    pessoa_id?: number;
    tipo?: string;
    polo?: string;
    status?: string;
  }): Promise<ListaDados<Acao>> => urbiVerso.api(`/acoes${qs(p as any)}`),
  buscarAcao: (id: number): Promise<Acao> => urbiVerso.api(`/acoes/${id}`),
  criarAcao: (corpo: NovaAcao): Promise<Acao> => urbiVerso.api('/acoes', JSON_POST(corpo)),
  // Editar aceita o mesmo formato de criar, sem os vínculos — a edição mexe nos
  // campos da ação; vínculo entra e sai pelas rotas próprias.
  editarAcao: (id: number, corpo: Omit<NovaAcao, 'imoveis' | 'pessoas'>): Promise<Acao> =>
    urbiVerso.api(`/acoes/${id}`, JSON_POST(corpo, 'PATCH')),
  removerAcao: (id: number): Promise<any> =>
    urbiVerso.api(`/acoes/${id}/remover`, JSON_POST(undefined)),
  vincularPessoaNaAcao: (id: number, pessoaId: number, papel: string): Promise<any> =>
    urbiVerso.api(`/acoes/${id}/pessoas`, JSON_POST({ pessoa_id: pessoaId, papel })),
  desvincularPessoaDaAcao: (id: number, vinculoId: number): Promise<any> =>
    urbiVerso.api(`/acoes/${id}/pessoas/${vinculoId}/remover`, JSON_POST(undefined)),
  vincularImovelNaAcao: (id: number, imovelId: number, imovelTipo: string): Promise<any> =>
    urbiVerso.api(`/acoes/${id}/imoveis`, JSON_POST({ imovel_id: imovelId, imovel_tipo: imovelTipo })),
  desvincularImovelDaAcao: (id: number, vinculoId: number): Promise<any> =>
    urbiVerso.api(`/acoes/${id}/imoveis/${vinculoId}/remover`, JSON_POST(undefined)),

  // ---- Dados de regularização do Parcelamento (tabela do app) ----
  listarParcelamentoDados: (): Promise<ListaDados<any>> => urbiVerso.api('/parcelamento-dados'),
  salvarParcelamentoDados: (parcelamentoId: number, corpo: Record<string, unknown>): Promise<any> =>
    urbiVerso.api(`/parcelamento-dados/${parcelamentoId}`, JSON_POST(corpo, 'PUT')),
  aprovarProposta: (id: number): Promise<Proposta> =>
    urbiVerso.api(`/propostas/${id}/aprovar`, JSON_POST(undefined)),
  copiarProposta: (id: number, corpo: Partial<Proposta>): Promise<Proposta> =>
    urbiVerso.api(`/propostas/${id}/copiar`, JSON_POST(corpo)),

  // ---- Núcleo (leitura) ----
  // Tudo pelo `nucleo-cliente`: ele pagina em laço, memoriza por sessão e
  // distingue flag desligada de lista vazia. Chamar `urbiVerso.nucleo` direto
  // daqui perde as três coisas.
  setores: (): Promise<any[]> => nucleo.listarTudo('setores-habitacionais'),
  setor: (id: number): Promise<any> => nucleo.buscar('setores-habitacionais', id),
  parcelamentos: (p?: Record<string, string | number>): Promise<any[]> =>
    nucleo.listarTudo('parcelamentos', p),
  parcelamento: (id: number): Promise<any> => nucleo.buscar('parcelamentos', id),
  // `unidades` só existe sob incorporação no Núcleo — `incorporacao_id` é NOT
  // NULL e não há coluna `parcelamento_id`. Por isso o filtro aqui é por
  // incorporação, e o objeto de navegação da app é o LOTE.
  unidades: (p?: { incorporacao_id: number }): Promise<any[]> =>
    nucleo.listarTudo('unidades', p),
  unidade: (id: number): Promise<any> => nucleo.buscar('unidades', id),
  lotes: (p?: Record<string, string | number>): Promise<any[]> =>
    nucleo.listarTudo('lotes', p),
  lote: (id: number): Promise<any> => nucleo.buscar('lotes', id),
  matriculas: (): Promise<any[]> => nucleo.listarTudo('matriculas'),
  /** Incorporação de um lote, quando há. Exige a flag `ler` em `incorporacoes`. */
  incorporacao: (id: number): Promise<any> => nucleo.buscar('incorporacoes', id),
  /** Ocupantes do lote (`imovel_pessoas`). Uma requisição por lote — ver o cliente. */
  pessoasDoLote: (id: number): Promise<any[]> => nucleo.listarSubRecurso('lotes', id, 'pessoas'),

  // ---- Moradores (pessoas do Núcleo) ----
  // `GET /pessoas` pagina no servidor e filtra por `busca` (ILIKE sobre nome,
  // CPF, razão social e CNPJ) e por `tipo`. É uma das poucas listas do Núcleo
  // que NÃO precisa de varredura: o filtro é do servidor porque o conjunto
  // (~2.873 pessoas) não cabe confortavelmente em memória e a busca do Núcleo
  // já cobre os dois campos que importam.
  pessoas: (p?: { busca?: string; tipo?: string }, pagina = 1, porPagina = 50) =>
    nucleo.listarPagina('pessoas', (p || {}) as Record<string, unknown>, pagina, porPagina),
  pessoa: (id: number): Promise<any> => nucleo.buscar('pessoas', id),
  /** Telefones e emails de uma PF — dois sub-recursos, uma requisição cada. */
  telefonesDaPessoa: (id: number): Promise<any[]> =>
    nucleo.listarSubRecurso('pessoas/fisicas', id, 'telefones'),
  emailsDaPessoa: (id: number): Promise<any[]> =>
    nucleo.listarSubRecurso('pessoas/fisicas', id, 'emails'),
};
