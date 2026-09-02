/**
 * Ações judiciais sobre imóveis e/ou pessoas (reg360) — lógica pura.
 *
 * Ações estavam fora do MVP da spec v0.9 e voltaram ao escopo porque aparecem
 * nas telas do legado: badges no cabeçalho do lote e uma aba com
 * `Data · Nº Processo · Valor`.
 *
 * Elas moram no schema do app, sem relação com outros apps, e são sobre
 * imóveis **e/ou** pessoas — daí os dois vínculos N:N e a regra de que ao menos
 * um dos dois precisa existir. Ação sobre nada não é ação.
 */

export const TIPOS_ACAO = ['revisional', 'obrigacao_de_fazer', 'outra'] as const;
export const POLOS = ['up_contra', 'contra_up'] as const;
export const STATUS_ACAO = ['ativa', 'encerrada', 'suspensa'] as const;
export const PAPEIS_PESSOA = ['autor', 'reu', 'interessado'] as const;
export const TIPOS_IMOVEL = ['lote', 'unidade'] as const;

export type TipoAcao = (typeof TIPOS_ACAO)[number];
export type Polo = (typeof POLOS)[number];
export type StatusAcao = (typeof STATUS_ACAO)[number];
export type PapelPessoa = (typeof PAPEIS_PESSOA)[number];

/** Colunas que o cliente pode enviar ao criar ou editar uma ação. */
export const CAMPOS_EDITAVEIS_ACAO = [
  'tipo',
  'polo',
  'data',
  'numero_processo',
  'valor',
  'descricao',
  'status',
] as const;

export const ROTULO_TIPO: Record<TipoAcao, string> = {
  revisional: 'Ação Revisional',
  obrigacao_de_fazer: 'Ação de Obrigação de Fazer',
  outra: 'Ação',
};

export const ROTULO_PAPEL: Record<PapelPessoa, string> = {
  autor: 'Autor',
  reu: 'Réu',
  interessado: 'Interessado',
};

export const ROTULO_STATUS: Record<StatusAcao, string> = {
  ativa: 'Ativa',
  encerrada: 'Encerrada',
  suspensa: 'Suspensa',
};

/**
 * Cor do badge por tipo, num mapa só.
 *
 * Mapa exato, nunca `includes` sobre o valor: `'obrigacao_de_fazer'` contém
 * `'obrigacao'`, e classificar por substring é como um status vira o badge do
 * outro sem ninguém perceber (foi o defeito de `badgeRegularizacao`).
 */
export type CorBadge = 'aviso' | 'info' | 'padrao' | 'sucesso' | 'perigo';

const COR_POR_TIPO: Record<TipoAcao, CorBadge> = {
  revisional: 'aviso',
  obrigacao_de_fazer: 'info',
  outra: 'padrao',
};

export function ehTipoAcao(v: unknown): v is TipoAcao {
  return TIPOS_ACAO.includes(v as TipoAcao);
}
export function ehPolo(v: unknown): v is Polo {
  return POLOS.includes(v as Polo);
}
export function ehStatusAcao(v: unknown): v is StatusAcao {
  return STATUS_ACAO.includes(v as StatusAcao);
}
export function ehPapelPessoa(v: unknown): v is PapelPessoa {
  return PAPEIS_PESSOA.includes(v as PapelPessoa);
}
export function ehTipoImovel(v: unknown): boolean {
  return TIPOS_IMOVEL.includes(v as any);
}

/** Badge de uma ação: cor pelo tipo, rótulo pelo tipo. */
export function badgeAcao(acao: any): { cor: CorBadge; rotulo: string } {
  const tipo = tipoOuOutra(acao?.tipo);
  return { cor: COR_POR_TIPO[tipo], rotulo: ROTULO_TIPO[tipo] };
}

/**
 * Tipo desconhecido cai em `outra`, nunca quebra a tela. `tipo` é catálogo
 * ABERTO por ora — a lista completa nunca foi levantada, e `outra` + descrição
 * é a válvula que evita migração a cada tipo novo.
 */
function tipoOuOutra(v: unknown): TipoAcao {
  return ehTipoAcao(v) ? v : 'outra';
}

/**
 * Só ação ATIVA vira badge de destaque no cabeçalho.
 *
 * Encerrada e suspensa continuam na aba — some da aba seria perder histórico —,
 * mas destacá-las no topo diria que há litígio em curso onde não há.
 */
export function destacaNoCabecalho(acao: any): boolean {
  return acao?.status === 'ativa';
}

/**
 * Título da ação, com o polo: `{tipo} de {A} contra {B}`.
 *
 * Uma função só, usada pelo card, pelo badge e por qualquer listagem — o título
 * montado em dois lugares diverge no dia em que um deles muda.
 *
 * `alvo` é como o imóvel (ou a pessoa) se chama na tela. Sem alvo conhecido, o
 * título ainda diz o polo: `de UP contra a parte contrária` é menos informação,
 * mas não é informação errada.
 */
export function tituloAcao(acao: any, alvo?: string | null): string {
  const tipo = tipoOuOutra(acao?.tipo);
  const nome = (alvo ?? '').trim() || 'a parte contrária';
  const lados = acao?.polo === 'up_contra'
    ? { de: 'UP', contra: nome }
    : { de: nome, contra: 'UP' };
  return `${ROTULO_TIPO[tipo]} de ${lados.de} contra ${lados.contra}`;
}

/** Extrai apenas os campos editáveis de um objeto (whitelist). */
export function apenasEditaveisAcao(fonte: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS_ACAO) {
    if (fonte != null && fonte[campo] !== undefined) out[campo] = fonte[campo];
  }
  return out;
}

export interface VinculoImovel {
  imovel_id: number;
  imovel_tipo: string;
}
export interface VinculoPessoa {
  pessoa_id: number;
  papel?: string;
}

/**
 * Normaliza e valida a lista de vínculos de imóvel vinda do cliente.
 *
 * Devolve `{ erro }` em vez de lançar: quem chama é uma rota, e a mensagem
 * precisa chegar ao usuário dizendo qual entrada está errada.
 */
export function lerVinculosImovel(
  bruto: unknown,
): { vinculos: VinculoImovel[] } | { erro: string } {
  if (bruto === undefined || bruto === null) return { vinculos: [] };
  if (!Array.isArray(bruto)) return { erro: 'imoveis precisa ser uma lista' };
  const vinculos: VinculoImovel[] = [];
  for (const v of bruto) {
    const id = Number((v as any)?.imovel_id);
    const tipo = (v as any)?.imovel_tipo;
    if (!Number.isInteger(id) || id < 1) return { erro: 'imovel_id inválido em imoveis' };
    if (!ehTipoImovel(tipo)) return { erro: `imovel_tipo precisa ser ${TIPOS_IMOVEL.join(' ou ')}` };
    vinculos.push({ imovel_id: id, imovel_tipo: String(tipo) });
  }
  return { vinculos: deduplicarImoveis(vinculos) };
}

export function lerVinculosPessoa(
  bruto: unknown,
): { vinculos: Required<VinculoPessoa>[] } | { erro: string } {
  if (bruto === undefined || bruto === null) return { vinculos: [] };
  if (!Array.isArray(bruto)) return { erro: 'pessoas precisa ser uma lista' };
  const vinculos: Required<VinculoPessoa>[] = [];
  for (const v of bruto) {
    const id = Number((v as any)?.pessoa_id);
    const papel = (v as any)?.papel ?? 'interessado';
    if (!Number.isInteger(id) || id < 1) return { erro: 'pessoa_id inválido em pessoas' };
    if (!ehPapelPessoa(papel)) return { erro: `papel precisa ser ${PAPEIS_PESSOA.join(', ')}` };
    vinculos.push({ pessoa_id: id, papel: String(papel) as PapelPessoa });
  }
  const vistos = new Set<number>();
  return { vinculos: vinculos.filter((v) => (vistos.has(v.pessoa_id) ? false : (vistos.add(v.pessoa_id), true))) };
}

/**
 * Vínculo repetido no MESMO corpo não é conflito de concorrência, é engano do
 * chamador — descartar é melhor que devolver 409 sobre a própria requisição.
 */
function deduplicarImoveis(lista: VinculoImovel[]): VinculoImovel[] {
  const vistos = new Set<string>();
  return lista.filter((v) => {
    const chave = `${v.imovel_tipo}:${v.imovel_id}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

/**
 * Filtro por imóvel exige os DOIS campos.
 *
 * `imovel_id` sozinho parece funcionar e devolve as ações do lote 5 **e** da
 * unidade 5 — objetos diferentes com o mesmo número. Filtro pela metade é pior
 * que filtro ausente: o resultado tem cara de certo.
 */
export function lerFiltroImovel(
  query: Record<string, unknown> | undefined,
): { filtro: VinculoImovel | null } | { erro: string } {
  const temId = query?.imovel_id !== undefined && query?.imovel_id !== '';
  const temTipo = query?.imovel_tipo !== undefined && query?.imovel_tipo !== '';
  if (!temId && !temTipo) return { filtro: null };
  if (temId !== temTipo) return { erro: 'imovel_id e imovel_tipo precisam vir juntos' };
  const id = Number(query?.imovel_id);
  if (!Number.isInteger(id) || id < 1) return { erro: 'imovel_id inválido' };
  if (!ehTipoImovel(query?.imovel_tipo)) {
    return { erro: `imovel_tipo precisa ser ${TIPOS_IMOVEL.join(' ou ')}` };
  }
  return { filtro: { imovel_id: id, imovel_tipo: String(query?.imovel_tipo) } };
}

/**
 * O que precisa acontecer para a lista de pessoas de uma ação existente virar
 * a lista que o usuário montou na tela.
 *
 * Só existe porque **não há rota de PATCH de vínculo**: `acao_pessoas` aceita
 * criar e remover, e nada mais. Trocar o papel de alguém é, no protocolo, uma
 * remoção seguida de uma criação — e é exatamente o passo que se esquece de
 * fazer quando a tela compara só o conjunto de `pessoa_id`. Comparar por
 * `pessoa_id` **e** papel é o que faz a troca de papel virar operação.
 *
 * A ordem importa e é responsabilidade de quem executa: **remover antes de
 * adicionar**. `lerVinculosPessoa` deduplica por `pessoa_id`, então uma pessoa
 * tem no máximo um papel; adicionar primeiro esbarraria no vínculo antigo, que
 * a rota trata como idempotente e devolve intacto — a troca de papel sumiria
 * sem erro nenhum.
 */
export function diffVinculosPessoa(
  atuais: Array<{ id: number; pessoa_id: number; papel?: string | null }> | null | undefined,
  desejados: Array<{ pessoa_id: number; papel?: string | null }> | null | undefined,
): { remover: number[]; adicionar: Required<VinculoPessoa>[] } {
  const antes = new Map<number, { id: number; papel: string }>();
  for (const v of atuais || []) {
    const id = Number(v?.pessoa_id);
    if (!Number.isInteger(id) || id < 1) continue;
    antes.set(id, { id: Number(v.id), papel: String(v.papel ?? 'interessado') });
  }

  const depois = new Map<number, string>();
  for (const v of desejados || []) {
    const id = Number(v?.pessoa_id);
    if (!Number.isInteger(id) || id < 1) continue;
    if (depois.has(id)) continue;
    depois.set(id, String(v.papel ?? 'interessado'));
  }

  const remover: number[] = [];
  const adicionar: Required<VinculoPessoa>[] = [];

  for (const [pessoaId, vinculo] of antes) {
    const papelNovo = depois.get(pessoaId);
    if (papelNovo === undefined) { remover.push(vinculo.id); continue; }
    if (papelNovo !== vinculo.papel) remover.push(vinculo.id);
  }
  for (const [pessoaId, papel] of depois) {
    const vinculo = antes.get(pessoaId);
    if (vinculo && vinculo.papel === papel) continue;
    adicionar.push({ pessoa_id: pessoaId, papel: papel as PapelPessoa });
  }

  return { remover, adicionar };
}
