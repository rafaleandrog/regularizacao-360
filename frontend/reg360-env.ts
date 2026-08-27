/**
 * Shim de tipos do global `urbiVerso` injetado pelo shell.
 * Modelado a partir de apps/charles3/frontend/charles3-env.ts, com o helper
 * `nucleo()` adicionado (reg360 consome dados do Núcleo).
 */

export interface UrbiUsuario {
  id: number;
  nome: string;
  tipo?: string;
  papel?: string;
  permissoes: Record<string, string>;
  avatar_url: string | null;
}

export interface UrbiContexto {
  rolesApp?: string[];
  nivelApp?: string;
  roles?: string[];
  nivel?: string;
}

/**
 * Erro que `urbiVerso.api`/`nucleo` lançam em resposta não-2xx. O shell já
 * normaliza os vários envelopes de erro em `requisitarApi` e entrega
 * `message` + `status` + `codigo` — a app lê, não reparseia o corpo.
 *
 * Espelho manual, como o resto deste arquivo. Alinhar com os tipos do SDK
 * quando a issue #4 (piso de SDK) destravar.
 */
export interface ErroApi extends Error {
  status?: number;
  codigo?: string;
  detalhes?: unknown;
}

export interface UrbiVersoGlobal {
  usuario(): UrbiUsuario | null;
  contexto(): UrbiContexto | null;
  api(caminho: string, opcoes?: RequestInit): Promise<any>;
  nucleo(caminho: string, opcoes?: RequestInit): Promise<any>;
  fetch(caminho: string, opcoes?: RequestInit & { anonimo?: boolean }): Promise<Response>;
  notificar(mensagem: string, tipo?: 'info' | 'sucesso' | 'erro'): void;
  subRota(): string;
  href(sub: string): string;
  navegarSub(sub: string): void;
  escutarRota(cb: (subRota: string) => void): () => void;
}

declare global {
  // eslint-disable-next-line no-var
  var urbiVerso: UrbiVersoGlobal;
}

export const urbiVerso = globalThis.urbiVerso as UrbiVersoGlobal;
