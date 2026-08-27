/**
 * Status de regularização do Parcelamento, como o Núcleo o deriva.
 *
 * O Núcleo calcula em `enriquecerParcelamento` a partir de `data_registro` +
 * `regularizacao`, e devolve no payload. São exatamente três valores; a app
 * não recalcula, só traduz para rótulo e cor.
 *
 * Mapa EXATO de propósito, e isso não é preciosismo: a versão anterior casava
 * por substring, e `'nao_registrado'.includes('registrad')` é `true` — um
 * parcelamento **não registrado** aparecia como "Registrado", em verde. Falha
 * calada e do pior tipo, porque o status é o que a equipe usa para decidir o
 * que fazer com o lote.
 *
 * A fase de 4 estágios (Irregular → Em análise → Aprovado → Registrado) é
 * OUTRA classificação, do schema da app, e chega na issue #15.
 */

export type StatusParcelamento = 'registrado' | 'irregular' | 'nao_registrado';

export interface BadgeStatus {
  cor: string;
  label: string;
}

const BADGE: Record<StatusParcelamento, BadgeStatus> = {
  registrado: { cor: 'sucesso', label: 'Registrado' },
  irregular: { cor: 'perigo', label: 'Irregular' },
  nao_registrado: { cor: 'padrao', label: 'Não registrado' },
};

/**
 * Valor desconhecido é exibido como veio, em cor neutra — nunca mapeado por
 * aproximação. Se o Núcleo passar a derivar um quarto status, a tela mostra o
 * texto cru (visível, corrigível) em vez de mentir com um rótulo próximo.
 */
export function badgeStatusParcelamento(status: unknown): BadgeStatus {
  const chave = String(status ?? '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(BADGE, chave)) {
    return BADGE[chave as StatusParcelamento];
  }
  return { cor: 'padrao', label: chave ? String(status) : '—' };
}
