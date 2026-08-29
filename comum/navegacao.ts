/**
 * As abas de topo — fonte única.
 *
 * A lista precisa existir em dois lugares: `manifesto.json` → `nav`, que o
 * shell desenha no menu, e a `urbi-abas` que a app renderiza na página. O shell
 * lê JSON e não importa TypeScript, então a duplicação é da plataforma. O que
 * dá para evitar é elas divergirem calada: a tela deriva daqui, e
 * `backend/__tests__/navegacao.test.ts` amarra o manifesto item a item.
 */
export const ABAS_TOPO = [
  { id: 'regularizacao', titulo: 'Regularização', rota: '/', icone: 'fa-solid fa-city' },
  { id: 'parcelamentos', titulo: 'Parcelamentos', rota: '/parcelamentos', icone: 'fa-solid fa-map' },
  // Lotes, não Unidades: unidade só existe sob incorporação no Núcleo, e o
  // objeto de navegação da app é o Lote. Ver docs/README.md § Navegação.
  { id: 'lotes', titulo: 'Lotes', rota: '/lotes', icone: 'fa-solid fa-house' },
  { id: 'moradores', titulo: 'Moradores', rota: '/moradores', icone: 'fa-solid fa-users' },
] as const;
