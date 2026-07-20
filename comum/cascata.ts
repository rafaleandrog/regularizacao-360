/**
 * Lógica pura de vigência e cascata de propostas (reg360).
 *
 * Sem dependência de Express nem do framework de dados — funções puras,
 * compartilháveis entre backend e frontend e cobertas por testes unitários.
 * Regras de negócio: spec §2.3 (status de vigência) e §2.6 / RN-01 (cascata).
 */

/** Colunas que o cliente pode enviar ao criar/editar/copiar uma proposta. */
export const CAMPOS_EDITAVEIS = [
  'titulo',
  'descricao',
  'nivel',
  'tipo_proposta',
  'ref_id',
  'data_proposta',
  'data_fim_vigencia',
  'preco_m2',
  'preco_minimo_residencial',
  'preco_minimo_comercial_misto',
  'desconto_a_vista',
  'desconto_6x',
  'desconto_12x',
  'desconto_lote_grande',
  'lote_grande_m2',
] as const;

export type NivelProposta = 'setor' | 'parcelamento' | 'unidade';

/** Data de hoje em `YYYY-MM-DD` (fuso local do processo). */
export function hoje(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Normaliza um valor de data (Date | ISO | 'YYYY-MM-DD') para 'YYYY-MM-DD'. */
export function soData(valor: unknown): string | null {
  if (!valor) return null;
  if (valor instanceof Date) {
    return valor.toISOString().slice(0, 10);
  }
  const m = String(valor).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/** Uma proposta está no período de vigência em `ref` (inclusive nas bordas)? */
export function dentroDaVigencia(p: any, ref: string): boolean {
  const inicio = soData(p?.data_proposta);
  const fim = soData(p?.data_fim_vigencia);
  if (!inicio || !fim) return false;
  return inicio <= ref && fim >= ref;
}

/** Dia seguinte a `base` (default hoje), em `YYYY-MM-DD` (fuso local). */
export function amanha(base?: string): string {
  const d = base ? new Date(`${base}T00:00:00`) : new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * A proposta vence dentro da janela de alerta? (spec §5.3 / RN-02 — 24h antes).
 * Como `data_fim_vigencia` é DATE (sem hora) e a rotina roda diariamente, a
 * janela é [hoje, limite] — tipicamente `limite = amanhã`. Pega tanto o que
 * vence amanhã quanto o que vence hoje e ainda não foi notificado.
 */
export function dentroDaJanelaVencimento(p: any, hoje: string, limite: string): boolean {
  const fim = soData(p?.data_fim_vigencia);
  if (!fim) return false;
  return fim >= hoje && fim <= limite;
}

/** Uma proposta está aprovada? */
export function estaAprovada(p: any): boolean {
  return p?.status_aprovacao === 'aprovada';
}

/**
 * Entre as propostas candidatas de um mesmo nível, escolhe a que está vigente
 * em `ref`: precisa estar aprovada e dentro do período. Se houver mais de uma
 * (não deve, pelo único composto), vence a de `data_proposta` mais recente.
 */
export function selecionarVigente(propostas: any[], ref: string): any | null {
  const vigentes = (propostas || [])
    .filter((p) => estaAprovada(p) && dentroDaVigencia(p, ref))
    .sort((a, b) => (soData(b.data_proposta) || '').localeCompare(soData(a.data_proposta) || ''));
  return vigentes[0] || null;
}

/**
 * Monta a cadeia de candidatos da cascata, do mais específico ao mais geral.
 * O chamador (frontend) fornece os IDs dos pais quando conhecidos — o backend
 * não resolve a hierarquia do Núcleo (req.nucleo não expõe leitura por id).
 * Níveis sem ID conhecido são pulados.
 */
export function montarCadeia(
  nivel: string,
  refId: number,
  pais: { parcelamento_id?: number | null; setor_id?: number | null } = {},
): Array<{ nivel: NivelProposta; ref_id: number }> {
  const cadeia: Array<{ nivel: NivelProposta; ref_id: number }> = [];
  if (nivel === 'unidade') {
    cadeia.push({ nivel: 'unidade', ref_id: refId });
    if (pais.parcelamento_id) cadeia.push({ nivel: 'parcelamento', ref_id: pais.parcelamento_id });
    if (pais.setor_id) cadeia.push({ nivel: 'setor', ref_id: pais.setor_id });
  } else if (nivel === 'parcelamento') {
    cadeia.push({ nivel: 'parcelamento', ref_id: refId });
    if (pais.setor_id) cadeia.push({ nivel: 'setor', ref_id: pais.setor_id });
  } else if (nivel === 'setor') {
    cadeia.push({ nivel: 'setor', ref_id: refId });
  }
  return cadeia;
}

/** Extrai apenas os campos editáveis de um objeto (whitelist). */
export function apenasEditaveis(fonte: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS) {
    if (fonte != null && fonte[campo] !== undefined) out[campo] = fonte[campo];
  }
  return out;
}
