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

/**
 * Os quatro níveis, do mais geral ao mais específico.
 *
 * `lote` entrou porque o objeto de negociação é o Lote (ver a issue #7): no
 * Núcleo, `unidades.incorporacao_id` é NOT NULL, então unidade só existe sob
 * incorporação — e a maioria dos lotes não tem uma. `unidade` continua sendo o
 * nível MAIS específico, porque a unidade está DENTRO do lote: a incorporação
 * se ergue sobre ele.
 */
export type NivelProposta = 'setor' | 'parcelamento' | 'lote' | 'unidade';

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

/**
 * Estado de vigência de uma proposta, para a tela.
 *
 * Existe porque o badge de APROVAÇÃO sozinho engana: uma proposta "aprovada"
 * cuja `data_fim_vigencia` já passou aparece verde e não vale mais nada. São
 * dois eixos — aprovação e vigência — e a tela precisa mostrar os dois.
 */
export type StatusVigencia = 'pendente' | 'futura' | 'vigente' | 'vencida';

export function statusVigencia(p: any, ref: string): StatusVigencia {
  if (!estaAprovada(p)) return 'pendente';
  const inicio = soData(p?.data_proposta);
  const fim = soData(p?.data_fim_vigencia);
  if (inicio && inicio > ref) return 'futura';
  if (fim && fim < ref) return 'vencida';
  return 'vigente';
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
 * Cadeia de candidatos da cascata, do mais específico ao mais geral:
 * `Unidade → Lote → Parcelamento → Setor`.
 *
 * O chamador (frontend) fornece os ids dos pais quando os conhece — o backend
 * NÃO resolve a hierarquia do Núcleo, porque `req.nucleo` não lê. Elo sem id
 * conhecido é pulado, não invalida a cadeia: uma unidade cujo lote-pai não veio
 * ainda herda do parcelamento.
 */
export function montarCadeia(
  nivel: string,
  refId: number,
  pais: {
    lote_id?: number | null;
    parcelamento_id?: number | null;
    setor_id?: number | null;
  } = {},
): Array<{ nivel: NivelProposta; ref_id: number }> {
  const cadeia: Array<{ nivel: NivelProposta; ref_id: number }> = [];
  const empilhar = (n: NivelProposta, id: number | null | undefined) => {
    if (id) cadeia.push({ nivel: n, ref_id: id });
  };

  // Do mais específico ao mais geral. O elo de partida é o próprio nível
  // pedido; os de cima entram quando o chamador conhece o id do pai.
  switch (nivel) {
    case 'unidade':
      empilhar('unidade', refId);
      empilhar('lote', pais.lote_id);
      empilhar('parcelamento', pais.parcelamento_id);
      empilhar('setor', pais.setor_id);
      break;
    case 'lote':
      empilhar('lote', refId);
      empilhar('parcelamento', pais.parcelamento_id);
      empilhar('setor', pais.setor_id);
      break;
    case 'parcelamento':
      empilhar('parcelamento', refId);
      empilhar('setor', pais.setor_id);
      break;
    case 'setor':
      empilhar('setor', refId);
      break;
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
