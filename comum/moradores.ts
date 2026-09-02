/**
 * Situação de cadastro de um morador (reg360) — lógica pura.
 *
 * "Situação" na tela do legado é uma pergunta simples com uma armadilha: ela
 * responde se o cadastro está COMPLETO, e completude depende de quatro coisas —
 * nome, CPF, ao menos um contato, e ao menos um vínculo com imóvel.
 *
 * A armadilha é o vínculo. O Núcleo expõe `imovel_pessoas` **só pelo lado do
 * imóvel** (`GET /lotes/:id/pessoas`): não há rota de pessoa → imóveis, nem
 * filtro `pessoa_id` em `/imoveis` ou `/lotes`. Então, na maior parte das
 * telas, a app **não sabe** se a pessoa tem vínculo — e "não sei" não é "não
 * tem".
 *
 * Por isso a situação tem TRÊS estados, não dois. Pintar de vermelho um
 * cadastro que talvez esteja completo é pior que não pintar: manda alguém
 * corrigir o que não está quebrado, e some com a confiança na coluna inteira.
 */

export type SituacaoCadastro = 'completo' | 'incompleto' | 'indeterminado';

export interface DadosDeSituacao {
  /** Contatos conhecidos: telefones e emails da pessoa. */
  contatos?: { telefones?: unknown[]; emails?: unknown[] };
  /**
   * Vínculos com imóvel. `undefined` significa **não consultado** — diferente
   * de `[]`, que significa consultado e vazio.
   */
  vinculos?: unknown[];
}

export interface Situacao {
  estado: SituacaoCadastro;
  /** O que falta, em texto pronto para a tela. Vazio quando está completo. */
  faltando: string[];
  /** Por que não dá para afirmar, quando o estado é `indeterminado`. */
  motivoIndeterminado: string | null;
}

function temTexto(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== '';
}

export function situacaoCadastro(pessoa: any, dados: DadosDeSituacao = {}): Situacao {
  const faltando: string[] = [];

  if (!temTexto(pessoa?.nome) && !temTexto(pessoa?.razao_social)) faltando.push('nome');

  // O CPF é validado pelo NÚCLEO na gravação — aqui só se pergunta se existe.
  // Revalidar o dígito na app criaria uma segunda verdade que diverge da dele.
  const documento = pessoa?.cpf ?? pessoa?.cnpj;
  if (!temTexto(documento)) faltando.push('CPF');

  const telefones = dados.contatos?.telefones;
  const emails = dados.contatos?.emails;
  const contatosConsultados = telefones !== undefined || emails !== undefined;
  const temContato = (telefones?.length ?? 0) > 0 || (emails?.length ?? 0) > 0;
  if (contatosConsultados && !temContato) faltando.push('telefone ou email');

  const vinculosConsultados = dados.vinculos !== undefined;
  if (vinculosConsultados && (dados.vinculos?.length ?? 0) === 0) faltando.push('vínculo com imóvel');

  // Faltou algo que FOI consultado → incompleto, com certeza.
  if (faltando.length > 0) {
    return { estado: 'incompleto', faltando, motivoIndeterminado: null };
  }

  // Nada faltou, mas nem tudo foi olhado → indeterminado, e a tela diz o quê.
  const naoOlhado: string[] = [];
  if (!contatosConsultados) naoOlhado.push('contatos');
  if (!vinculosConsultados) naoOlhado.push('vínculo com imóvel');
  if (naoOlhado.length > 0) {
    return {
      estado: 'indeterminado',
      faltando: [],
      motivoIndeterminado: `${naoOlhado.join(' e ')} não consultado(s)`,
    };
  }

  return { estado: 'completo', faltando: [], motivoIndeterminado: null };
}

export const BADGE_SITUACAO: Record<SituacaoCadastro, { cor: string; rotulo: string }> = {
  completo: { cor: 'sucesso', rotulo: 'Completo' },
  incompleto: { cor: 'alerta', rotulo: 'Incompleto' },
  indeterminado: { cor: 'padrao', rotulo: '—' },
};

/**
 * Índice reverso pessoa → imóveis, montado a partir dos vínculos de um
 * conjunto de imóveis.
 *
 * Existe porque o Núcleo só entrega a relação pelo lado do imóvel. Cada imóvel
 * custa uma requisição, então quem chama decide o RECORTE — um parcelamento
 * (~100 lotes) é viável; a instância inteira (~6.200) não é.
 */
export function indexarPorPessoa(
  porImovel: Array<{ imovel: any; vinculos: any[] }>,
): Map<number, Array<{ imovel: any; vinculo: any }>> {
  const mapa = new Map<number, Array<{ imovel: any; vinculo: any }>>();
  for (const { imovel, vinculos } of porImovel || []) {
    for (const v of vinculos || []) {
      const id = Number(v?.pessoa_id);
      if (!Number.isInteger(id)) continue;
      const atual = mapa.get(id);
      if (atual) atual.push({ imovel, vinculo: v });
      else mapa.set(id, [{ imovel, vinculo: v }]);
    }
  }
  return mapa;
}

/**
 * O que o índice PARCIAL sabe sobre os vínculos de uma pessoa.
 *
 * Existe para nomear — e travar com teste — a regra que é fácil de perder:
 * **ausência no índice não é ausência de vínculo.** O índice cobre um recorte
 * (um parcelamento), e a lista de moradores é da instância inteira; traduzir
 * "não está no mapa" para `[]` marcaria `incompleto` quem está vinculada só a
 * outro parcelamento.
 *
 * Quem ESTÁ no mapa tem vínculo por construção: só entrou porque um imóvel a
 * listou. Então este índice nunca prova ausência — só presença.
 */
export function vinculosConhecidos(
  indice: Map<number, unknown[]>,
  pessoaId: unknown,
): unknown[] | undefined {
  return indice?.get(Number(pessoaId));
}

/** Rótulos humanos de `tipo_vinculo`, que é distinção jurídica do Núcleo. */
export const ROTULO_VINCULO: Record<string, string> = {
  posse_legitima: 'Posse legítima',
  posse_ilegitima: 'Posse ilegítima',
  usuario: 'Usuário',
};

/**
 * Os três estados dos ocupantes de um imóvel — e por que não são dois.
 *
 * "Nenhum morador vinculado" é uma **afirmação sobre o mundo**, e só pode ser
 * feita depois de perguntar. A tela do imóvel dizia isso para toda unidade,
 * porque o carregamento de ocupantes era gateado em `ehLote` — ela nunca
 * perguntava, e respondia mesmo assim.
 *
 * É o mesmo princípio que `situacaoCadastro` já aplica a contato e vínculo
 * (`indeterminado` em vez de "falta"), e que o PR #78 aplicou à listagem de
 * lotes: **não consultado não é vazio, e falha não é vazio.** Lista vazia é a
 * resposta certa só quando a pergunta foi feita e voltou sem ninguém.
 */
export type EstadoOcupantes = 'nao_consultado' | 'falhou' | 'vazio' | 'com_ocupantes';

export function estadoDosOcupantes(entrada: {
  consultado: boolean;
  falhou: boolean;
  quantidade: number;
}): EstadoOcupantes {
  // Falha vem antes de "consultado": quem falha fica no mapa com lista vazia
  // (para a tela não repetir a requisição a cada render), então perguntar só
  // pelo mapa não distinguiria falha de ausência real.
  if (entrada?.falhou) return 'falhou';
  if (!entrada?.consultado) return 'nao_consultado';
  return Number(entrada.quantidade) > 0 ? 'com_ocupantes' : 'vazio';
}

/**
 * O que a tela escreve em cada estado. `null` onde há ocupantes: aí quem fala
 * é a lista, não uma frase.
 */
export const TEXTO_OCUPANTES: Record<EstadoOcupantes, string | null> = {
  nao_consultado: 'Ocupantes ainda não consultados.',
  falhou: 'Não foi possível carregar os ocupantes — o número real pode ser outro.',
  vazio: 'Nenhum morador vinculado.',
  com_ocupantes: null,
};
