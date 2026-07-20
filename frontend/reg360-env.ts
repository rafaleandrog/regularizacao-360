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
