/**
 * Tipos das funções puras do importador.
 *
 * O script é ferramenta de operação em `.mjs` e fica fora do `tsconfig` do app —
 * mas as suas partes puras são testadas, e sem declaração o teste as receberia
 * como `any`, perdendo justamente a checagem que ele existe para dar.
 *
 * Só a superfície pura entra aqui. `importar()` fala HTTP e não se testa sem
 * uma instância.
 */

export declare const COLUNAS: Record<string, string>;
export declare const ENDPOINTS: {
  setores: string;
  parcelamentos: string;
  lotes: string;
  matriculas: string;
  pessoas_fisicas: string;
};

export declare function slugify(s: unknown): string;
export declare function soDigitos(s: unknown): string;
export declare function normalizarArea(s: unknown): number | null;
export declare function normalizarPreco(s: unknown): number | null;
export declare function casaComChave(registro: any, chave: Record<string, unknown>): boolean;
export declare function parseCsv(texto: string): Array<Record<string, string>>;
export declare function temTransacaoPendente(row: any, colunas?: Record<string, string>): boolean;

export interface Relatorio {
  criados: Record<string, number>;
  atualizados: Record<string, number>;
  ignorados: Record<string, number>;
  divergencias: string[];
  transacoesPendentes: string[];
  catalogoPendente: string[];
  erros: string[];
}
export declare function novoRelatorio(): Relatorio;
