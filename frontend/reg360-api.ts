import { urbiVerso } from './reg360-env.js';

/**
 * Cliente de API do reg360.
 *  - Rotas da app via `urbiVerso.api('/...')` (slug reg360 injetado).
 *  - Leituras do Núcleo via `urbiVerso.nucleo('/...')` (paths com hífen).
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
  nivel: 'setor' | 'parcelamento' | 'unidade';
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
    parcelamento_id?: number;
    setor_id?: number;
  }): Promise<{ vigente: Proposta | null; origem_cascata: string | null }> =>
    urbiVerso.api(`/propostas/vigente${qs(p)}`),
  criarProposta: (corpo: Partial<Proposta>): Promise<Proposta> =>
    urbiVerso.api('/propostas', JSON_POST(corpo)),
  aprovarProposta: (id: number): Promise<Proposta> =>
    urbiVerso.api(`/propostas/${id}/aprovar`, JSON_POST(undefined)),
  copiarProposta: (id: number, corpo: Partial<Proposta>): Promise<Proposta> =>
    urbiVerso.api(`/propostas/${id}/copiar`, JSON_POST(corpo)),

  // ---- Núcleo (leitura) ----
  setores: (): Promise<ListaDados<any>> => urbiVerso.nucleo('/setores-habitacionais'),
  setor: (id: number): Promise<any> => urbiVerso.nucleo(`/setores-habitacionais/${id}`),
  parcelamentos: (p?: Record<string, string | number>): Promise<ListaDados<any>> =>
    urbiVerso.nucleo(`/parcelamentos${qs(p)}`),
  parcelamento: (id: number): Promise<any> => urbiVerso.nucleo(`/parcelamentos/${id}`),
  unidades: (p?: Record<string, string | number>): Promise<ListaDados<any>> =>
    urbiVerso.nucleo(`/unidades${qs(p)}`),
  unidade: (id: number): Promise<any> => urbiVerso.nucleo(`/unidades/${id}`),
  lotes: (p?: Record<string, string | number>): Promise<ListaDados<any>> =>
    urbiVerso.nucleo(`/lotes${qs(p)}`),
};
