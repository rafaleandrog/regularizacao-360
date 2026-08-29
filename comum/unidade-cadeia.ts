/**
 * De qual parcelamento é uma unidade — e quando a resposta não existe.
 *
 * No Núcleo, `unidades` tem `incorporacao_id` (NOT NULL) e **não tem**
 * `lote_id` nem `parcelamento_id`. `incorporacoes` não tem pai nenhum: só
 * `id`, `nome` e `slug`. O único caminho para cima é
 *
 *     unidade → incorporação → lotes com aquele `incorporacao_id` → parcelamento
 *
 * e `lotes.incorporacao_id` é **N:1**: vários lotes podem apontar para a mesma
 * incorporação. Por isso **não existe "o lote" de uma unidade** — e é por isso
 * que a cadeia de proposta de uma unidade pula o elo `lote` em vez de escolher
 * um irmão qualquer.
 *
 * O parcelamento, esse, quase sempre existe e é único: os lotes de uma
 * incorporação normalmente estão no mesmo parcelamento. Quando não estão, a
 * herança é genuinamente ambígua, e a tela **diz** em vez de eleger um.
 */

export interface PaiDaUnidade {
  /** O parcelamento, quando os lotes da incorporação concordam num só. */
  parcelamentoId: number | null;
  /**
   * O lote, **só** quando a incorporação cobre exatamente um. Com mais de um,
   * fica `null` de propósito: eleger um irmão inventaria um vínculo que o
   * Núcleo não modela, e o preço herdado sairia de um lote arbitrário.
   */
  loteId: number | null;
  /** Quantos lotes a incorporação cobre. Zero é possível e não é erro. */
  quantidadeDeLotes: number;
  /**
   * Os lotes estão em mais de um parcelamento? Então a unidade não herda
   * parcelamento nem setor, e a tela precisa explicar isso.
   */
  ambiguo: boolean;
}

/**
 * Resolve o pai de uma unidade a partir dos lotes da incorporação dela.
 *
 * Pura de propósito: quem busca os lotes é o chamador (`GET /lotes?incorporacao_id=N`,
 * filtro que o Núcleo de fato honra), e a decisão fica testável sem rede.
 */
export function paiDaUnidade(lotesDaIncorporacao: readonly any[] | null | undefined): PaiDaUnidade {
  const lotes = Array.isArray(lotesDaIncorporacao) ? lotesDaIncorporacao : [];
  if (lotes.length === 0) {
    return { parcelamentoId: null, loteId: null, quantidadeDeLotes: 0, ambiguo: false };
  }

  const parcelamentos = new Set<number>();
  for (const l of lotes) {
    const p = Number(l?.parcelamento_id);
    // `lotes.parcelamento_id` é NOT NULL no Núcleo, mas um payload truncado
    // não pode virar `NaN` no conjunto e fingir divergência.
    if (Number.isInteger(p) && p > 0) parcelamentos.add(p);
  }

  const ambiguo = parcelamentos.size > 1;
  return {
    parcelamentoId: ambiguo || parcelamentos.size === 0 ? null : [...parcelamentos][0],
    loteId: lotes.length === 1 ? Number(lotes[0]?.id) || null : null,
    quantidadeDeLotes: lotes.length,
    ambiguo,
  };
}

/**
 * A frase que a tela mostra quando a unidade não herda tudo o que poderia.
 * `null` quando não há nada a explicar — o caso comum.
 */
export function avisoDeHeranca(pai: PaiDaUnidade): string | null {
  if (pai.ambiguo) {
    return `A incorporação desta unidade cobre ${pai.quantidadeDeLotes} lotes em parcelamentos diferentes. ` +
      'Sem um parcelamento único, a proposta vigente não herda de parcelamento nem de setor — ' +
      'só vale proposta feita na própria unidade.';
  }
  if (pai.quantidadeDeLotes === 0) {
    return 'A incorporação desta unidade não tem lote vinculado, então não há parcelamento de onde herdar preço. ' +
      'Só vale proposta feita na própria unidade.';
  }
  if (pai.quantidadeDeLotes > 1) {
    return `A incorporação cobre ${pai.quantidadeDeLotes} lotes, então não existe "o lote" desta unidade: ` +
      'a herança pula o nível de Lote e vai direto ao Parcelamento.';
  }
  return null;
}
