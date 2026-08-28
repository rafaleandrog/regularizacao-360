import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { urbiVerso } from './reg360-env.js';
import { reg360Api, type Proposta, type Acao, type NovaAcao } from './reg360-api.js';
import { falhaDeFlag, type FalhaDeFlag } from './nucleo-cliente.js';
import { filtrarPorTexto, normalizarTexto } from '../comum/busca.js';
import { mapaComLimite } from '../comum/concorrencia.js';
import { precoAplicavel, valorDoImovel, aplicarDescontos, type FormaPagamento } from '../comum/preco.js';
import {
  agregarImoveis, somarAgregados, indexarPropostas, chaveImovel, type Agregado,
} from '../comum/agregados.js';
import { badgeStatusParcelamento } from '../comum/status-parcelamento.js';
import {
  faseRegularizacao, badgeFase, badgeSituacaoRegistral, situacaoRegistralRelevante,
  FASES, SITUACOES_REGISTRAIS,
} from '../comum/regularizacao.js';
import { soData, hoje, statusVigencia, type StatusVigencia } from '../comum/cascata.js';
import { lerQuitacao } from '../comum/quitacao.js';
import {
  situacaoCadastro,
  indexarPorPessoa,
  vinculosConhecidos,
  BADGE_SITUACAO,
  ROTULO_VINCULO,
  type Situacao,
} from '../comum/moradores.js';
import {
  badgeAcao,
  destacaNoCabecalho,
  tituloAcao,
  ROTULO_PAPEL,
  ROTULO_STATUS,
  ROTULO_TIPO,
  TIPOS_ACAO,
  POLOS,
  STATUS_ACAO,
  PAPEIS_PESSOA,
  type TipoAcao,
  type PapelPessoa,
} from '../comum/acoes.js';

// urbi-shell-page não está no barrel de primitivos — os demais urbi-* são
// registrados globalmente pelo shell (ui/src/primitivos.ts).

// ---------------------------------------------------------------------------
// Helpers de formatação e mapeamento
// ---------------------------------------------------------------------------

const NIVEL_LABEL: Record<string, string> = {
  setor: 'Setor Habitacional',
  parcelamento: 'Parcelamento',
  lote: 'Lote',
  unidade: 'Unidade',
};

/**
 * Quantos lotes por página na tabela do Parcelamento.
 *
 * Pequeno de propósito: a coluna "Pessoas" custa UMA requisição por linha —
 * o Núcleo não expõe `imovel_pessoas` em lote — então o tamanho da página é o
 * número de requisições por virada.
 */
const LOTES_POR_PAGINA = 25;

/** Requisições simultâneas ao buscar ocupantes. Janela, não enxurrada. */
const LIMITE_SIMULTANEO = 6;

/** Vigência é eixo separado da aprovação — ver `statusVigencia`. */
const BADGE_VIGENCIA: Record<StatusVigencia, { cor: string; rotulo: string }> = {
  pendente: { cor: 'alerta', rotulo: 'Pendente' },
  futura: { cor: 'info', rotulo: 'Futura' },
  vigente: { cor: 'sucesso', rotulo: 'Vigente' },
  vencida: { cor: 'padrao', rotulo: 'Vencida' },
};

const TIPO_OPCOES = [
  { valor: 'tabela', rotulo: 'Tabela' },
  { valor: 'campanha', rotulo: 'Campanha' },
  { valor: 'negociacao_coletiva', rotulo: 'Negociação coletiva' },
];

function fmtMoeda(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtArea(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtData(v: unknown): string {
  const d = soData(v);
  if (!d) return '—';
  const [y, m, dia] = d.split('-');
  return `${dia}/${m}/${y}`;
}

function nomeDe(o: any): string {
  return o?.nome ?? o?.id_legivel ?? o?.slug ?? o?.identificador ?? `#${o?.id ?? '?'}`;
}

interface Rota {
  view: 'home' | 'parcelamentos' | 'unidades' | 'moradores' | 'setor' | 'parcelamento' | 'lote' | 'unidade' | 'proposta' | 'morador';
  id: number | null;
  /**
   * Filtro de Setor da lista de Parcelamentos. Vai na sub-rota
   * (`/parcelamentos/setor/2`) e não em query string porque `subRota()` do
   * shell é montada só do `pathname` — `?setor=2` não chegaria aqui.
   */
  filtroSetor?: number | null;
  /** Filtro de fase de regularização, também na sub-rota. */
  filtroFase?: string | null;
}

function parseRota(sub: string): Rota {
  const partes = (sub || '/').split('/').filter(Boolean);
  if (partes.length === 0) return { view: 'home', id: null };
  const [a, b] = partes;
  const id = b ? Number(b) : null;
  switch (a) {
    case 'parcelamentos': {
      const setor = partes[1] === 'setor' && partes[2] ? Number(partes[2]) : null;
      const fase = partes[1] === 'fase' && partes[2] ? partes[2] : null;
      return {
        view: 'parcelamentos',
        id: null,
        filtroSetor: Number.isInteger(setor) ? setor : null,
        filtroFase: fase,
      };
    }
    case 'unidades': return { view: 'unidades', id: null };
    case 'moradores': return { view: 'moradores', id: null };
    case 'morador': return { view: 'morador', id };
    case 'setor': return { view: 'setor', id };
    case 'parcelamento': return { view: 'parcelamento', id };
    case 'lote': return { view: 'lote', id };
    case 'unidade': return { view: 'unidade', id };
    case 'proposta': return { view: 'proposta', id };
    default: return { view: 'home', id: null };
  }
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

@customElement('app-reg360')
export class AppReg360 extends LitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .barra-acoes { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
    .prop-card {
      border: 1px solid var(--cor-borda, rgba(255,255,255,.08));
      border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 6px;
    }
    .prop-topo { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .prop-titulo { font-weight: 600; }
    .prop-meta { color: var(--cor-texto-sec, rgba(255,255,255,.6)); font-size: .85rem; }
    .prop-acoes { display: flex; gap: 6px; flex-wrap: wrap; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-grid .full { grid-column: 1 / -1; }
    .erro { color: var(--cor-erro, #D45A3A); }
    .secao-titulo { margin: 16px 0 8px; font-weight: 600; }
  `;

  @state() private rota: Rota = { view: 'home', id: null };
  @state() private carregando = false;
  @state() private erro: string | null = null;

  @state() private setores: any[] = [];
  @state() private parcelamentos: any[] = [];
  @state() private unidades: any[] = [];

  @state() private detalhe: any = null;
  @state() private propostas: Proposta[] = [];
  @state() private vigente: { vigente: Proposta | null; origem_cascata: string | null } | null = null;
  @state() private abaDetalhe = '';

  /** Termo digitado na busca. Transitório de propósito: não vai para a rota. */
  @state() private termoBusca = '';
  /** Endereço é local e barato; morador exige carregar ocupantes de todo o parcelamento. */
  @state() private modoBusca: 'endereco' | 'morador' = 'endereco';

  @state() private lotes: any[] = [];
  @state() private paginaLotes = 1;
  /** `matricula_id` → matrícula, para a tabela não exibir id cru. */
  @state() private matriculasPorId = new Map<number, any>();
  /** `lote.id` → ocupantes. Preenchido sob demanda, página a página. */
  @state() private pessoasPorLote = new Map<number, any[]>();
  @state() private carregandoPessoas = false;
  /** `parcelamento_id` → dados de regularização do app. */
  @state() private regularizacaoPorParcelamento = new Map<number, any>();
  /** Dados do imóvel aberto: preços de contrato e manual. */
  @state() private dadosDoImovel: any = {};
  /** Modal de preço: qual campo, valor e se é correção de contrato. */
  @state() private formPreco: { campo: 'estatico' | 'manual' | 'corrigir'; valor: string } | null = null;
  @state() private formRegAberto = false;
  @state() private formReg: Record<string, any> = {};
  /** Parcelamento e incorporação do imóvel aberto, resolvidos para exibir nome. */
  @state() private paiDoImovel: { parcelamento?: any; incorporacao?: any } = {};
  /** Unidades da incorporação do lote aberto, quando há incorporação. */
  @state() private unidadesDoLote: any[] = [];

  /** Flag de Núcleo negada — vira banner explicável, nunca lista vazia. */
  @state() private avisoFlag: FalhaDeFlag | null = null;
  /** Agregado por parcelamento, derivado da varredura de lotes. */
  @state() private porParcelamento = new Map<number, { quantidade: number; area: number }>();
  @state() private varrendoLotes = false;
  /** Todos os lotes da instância, para os agregados por parcelamento e setor. */
  @state() private todosOsLotes: any[] = [];
  /** Propostas vigentes indexadas por `nivel:ref_id`, e preços por imóvel. */
  @state() private vigentesPorAlvo = new Map<string, any>();
  @state() private precosPorImovel = new Map<string, any>();
  @state() private carregandoVgv = false;
  /**
   * Bases do VGV já carregadas nesta sessão.
   *
   * Campo próprio, e não `vigentesPorAlvo.size > 0`: derivar disso erra dos
   * DOIS lados — com zero propostas a memória nunca trava e cada navegação
   * revarre tudo; depois de carregada, nada consegue invalidá-la, e gravar um
   * preço deixa cards e KPIs mostrando o valor velho até um reload.
   */
  @state() private basesDoVgvCarregadas = false;

  /** Moradores: página do Núcleo, busca do servidor, e o índice reverso. */
  @state() private moradores: any[] = [];
  @state() private moradoresPagina = 1;
  @state() private moradoresPaginas = 1;
  @state() private moradoresTotal = 0;
  @state() private buscaMorador = '';
  /** Mostrar só quem tem falta COMPROVADA — o uso prático da coluna Situação. */
  @state() private soIncompletos = false;
  /** Filtro de quitação na tabela de lotes: o índice `(imovel_tipo, quitado)` existe para isto. */
  @state() private filtroQuitacao: 'todos' | 'quitados' | 'nao_quitados' = 'todos';
  @state() private contatosPorPessoa = new Map<number, { telefones: any[]; emails: any[] }>();
  /**
   * Imóveis por pessoa. Só existe para o parcelamento que o usuário escolheu
   * indexar — o Núcleo não entrega o reverso, e montá-lo para a instância
   * inteira custaria uma requisição por lote (~6.200).
   */
  @state() private imoveisPorPessoa = new Map<number, Array<{ imovel: any; vinculo: any }>>();
  @state() private parcelamentoIndexado: number | null = null;
  @state() private indexando = false;
  /** Lotes cuja leitura de ocupantes falhou — o recorte saiu incompleto. */
  @state() private lotesQueFalharam = 0;

  /** Ações do imóvel aberto, com os vínculos que a rota já devolve junto. */
  @state() private acoes: Acao[] = [];
  @state() private carregandoAcoes = false;
  @state() private buscaAcaoPessoa = '';
  @state() private formAcao: Record<string, any> | null = null;

  @state() private formAberto = false;
  @state() private formModo: 'criar' | 'copiar' = 'criar';
  @state() private formOrigemId: number | null = null;
  @state() private formNivel = 'setor';
  @state() private formRefId = 0;
  @state() private form: Record<string, any> = {};

  private _desligarRota?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    this.rota = parseRota(urbiVerso.subRota?.() || '/');
    this._desligarRota = urbiVerso.escutarRota?.((sub) => {
      this.rota = parseRota(sub);
      this._carregar();
    });
    this._carregar();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._desligarRota?.();
  }

  private get podeCriar(): boolean {
    const ctx = urbiVerso.contexto?.();
    const roles = ctx?.roles || ctx?.rolesApp || [];
    return ctx?.nivel === 'admin' || ctx?.nivelApp === 'admin' || roles.includes('criador');
  }
  private get podeAprovar(): boolean {
    const ctx = urbiVerso.contexto?.();
    const roles = ctx?.roles || ctx?.rolesApp || [];
    return ctx?.nivel === 'admin' || ctx?.nivelApp === 'admin' || roles.includes('validador_interno');
  }

  private _navegar(sub: string) {
    urbiVerso.navegarSub?.(sub);
  }

  // -------------------------------------------------------------------------
  // Carregamento por view
  // -------------------------------------------------------------------------

  private async _carregar() {
    this.erro = null;
    this.avisoFlag = null;
    this.carregando = true;
    try {
      switch (this.rota.view) {
        case 'home':
          // Setores e parcelamentos são uma página cada (6 e 60) — a tela
          // aparece já. A contagem de lotes precisa varrer ~6.200 registros em
          // 32 requisições, então roda em segundo plano e preenche depois.
          this.setores = await reg360Api.setores();
          this.parcelamentos = await reg360Api.parcelamentos();
          void this._varrerLotes();
          void this._carregarRegularizacao();
          break;
        case 'parcelamentos':
          // Setores vêm junto porque o card mostra o NOME do setor, não o id, e
          // os chips de filtro saem da lista real — nunca de array literal.
          this.setores = await reg360Api.setores();
          this.parcelamentos = await reg360Api.parcelamentos();
          void this._varrerLotes();
          break;
        case 'unidades':
          this.unidades = await reg360Api.unidades();
          break;
        case 'moradores':
          // Parcelamentos vêm junto porque o seletor de recorte do índice sai
          // da lista real, nunca de array literal.
          this.parcelamentos = await reg360Api.parcelamentos();
          await this._carregarMoradores(1);
          break;
        case 'morador':
          if (this.rota.id) {
            this.detalhe = await reg360Api.pessoa(this.rota.id);
            await this._carregarContatos([this.detalhe]);
          }
          break;
        case 'setor':
          if (this.rota.id) {
            this.abaDetalhe = 'empreendimentos';
            this.detalhe = await reg360Api.setor(this.rota.id);
            this.parcelamentos = await reg360Api.parcelamentos({ setor_habitacional_id: this.rota.id });
            await this._carregarPropostas('setor', this.rota.id);
            void this._varrerLotes();
          }
          break;
        case 'parcelamento':
          if (this.rota.id) {
            this.abaDetalhe = 'lotes';
            this.paginaLotes = 1;
            this.termoBusca = '';
            this.detalhe = await reg360Api.parcelamento(this.rota.id);
            // `parcelamento_id` É filtro válido em GET /lotes (ao contrário de
            // `unidades`, que nem tem essa coluna).
            this.lotes = await reg360Api.lotes({ parcelamento_id: this.rota.id });
            await this._carregarPropostas('parcelamento', this.rota.id);
            void this._carregarMatriculas();
            void this._carregarPessoasDaPagina();
            void this._carregarRegularizacao();
            // Sem isto, abrir a página direto (ou dar reload nela) renderiza o
            // VGV com as bases vazias: R$ 0 e "todos sem preço", com cara de
            // resposta. Não precisa varrer os lotes da instância — os lotes
            // deste parcelamento já vieram acima.
            void this._carregarBasesDoVgv();
          }
          break;
        case 'lote':
        case 'unidade':
          if (this.rota.id) {
            this.abaDetalhe = 'propostas';
            const ehLote = this.rota.view === 'lote';
            this.detalhe = ehLote
              ? await reg360Api.lote(this.rota.id)
              : await reg360Api.unidade(this.rota.id);
            await this._carregarPropostas(this.rota.view, this.rota.id);
            if (ehLote) this.pessoasPorLote = new Map([[this.rota.id, await reg360Api.pessoasDoLote(this.rota.id)]]);
            void this._carregarMatriculas();
            void this._carregarAcoes();
            // O contexto vem ANTES da cascata: sem o parcelamento resolvido não
            // se sabe o setor, e o elo de Setor da cadeia seria pulado — a
            // unidade não herdaria o preço-base que sempre existe lá.
            await this._carregarContextoDoImovel();
            void this._carregarDadosDoImovel();
            this.vigente = await reg360Api.resolverVigente({
              nivel: this.rota.view,
              ref_id: this.rota.id,
              lote_id: ehLote ? undefined : this.detalhe?.lote_id,
              parcelamento_id: this.detalhe?.parcelamento_id ?? this.paiDoImovel.parcelamento?.id,
              setor_id: this.paiDoImovel.parcelamento?.setor_habitacional_id,
            });
          }
          break;
        case 'proposta':
          if (this.rota.id) this.detalhe = await reg360Api.buscarProposta(this.rota.id);
          break;
      }
    } catch (e: any) {
      this._registrarFalha(e, 'Falha ao carregar dados');
    } finally {
      this.carregando = false;
    }
  }

  /**
   * Flag de Núcleo negada não é erro genérico: é o admin que não ligou o
   * toggle, ou manifesto que não pediu. Sem essa distinção a tela mostra
   * "nenhum registro" e ninguém descobre que faltou permissão.
   */
  private _registrarFalha(e: unknown, padrao: string) {
    const flag = falhaDeFlag(e);
    if (flag) this.avisoFlag = flag;
    else this.erro = (e as any)?.message || padrao;
  }

  /**
   * Varre os lotes uma vez por sessão e agrega por parcelamento. O cliente
   * memoriza, então voltar para a home não repete as 32 requisições.
   */
  private async _varrerLotes() {
    if (this.varrendoLotes || this.porParcelamento.size > 0) return;
    this.varrendoLotes = true;
    try {
      const lotes = await reg360Api.lotes();
      this.todosOsLotes = lotes;
      const mapa = new Map<number, { quantidade: number; area: number }>();
      for (const l of lotes) {
        const pid = Number(l?.parcelamento_id);
        if (!Number.isInteger(pid)) continue;
        const atual = mapa.get(pid) || { quantidade: 0, area: 0 };
        atual.quantidade += 1;
        atual.area += Number(l?.area_efetiva ?? l?.area ?? 0) || 0;
        mapa.set(pid, atual);
      }
      this.porParcelamento = mapa;
      void this._carregarBasesDoVgv();
    } catch (e: any) {
      // Falha aqui degrada a contagem, não a navegação — a tela continua
      // utilizável sem os números.
      this._registrarFalha(e, 'Falha ao contar lotes');
    } finally {
      this.varrendoLotes = false;
    }
  }

  /**
   * Índice de matrículas. O payload do lote traz só `matricula_id` e a área da
   * matrícula — não o número. E `GET /matriculas` **não aceita filtro por id**
   * (só `busca` por numero/cri/uf), então não dá para pedir as 38 de um
   * parcelamento: ou se varre tudo uma vez e memoriza, ou se faz uma requisição
   * por lote. A varredura ganha, e o cache a paga uma vez por sessão.
   */
  private async _carregarMatriculas() {
    if (this.matriculasPorId.size > 0) return;
    try {
      const mats = await reg360Api.matriculas();
      this.matriculasPorId = new Map(mats.map((m: any) => [Number(m.id), m]));
    } catch (e: any) {
      // Degrada a coluna Matrícula, não a tela.
      this._registrarFalha(e, 'Falha ao carregar matrículas');
    }
  }

  /**
   * Resolve os "pais" do imóvel para a tela mostrar NOME, não id: o
   * Parcelamento do lote e, quando existe, a Incorporação. Com incorporação,
   * carrega também as unidades dela — que é onde `unidades` de fato vive no
   * Núcleo (`incorporacao_id` é NOT NULL, e é o único filtro válido).
   */
  private async _carregarContextoDoImovel() {
    const d = this.detalhe;
    if (!d) return;
    this.paiDoImovel = {};
    this.unidadesDoLote = [];
    try {
      if (d.parcelamento_id) {
        this.paiDoImovel = { ...this.paiDoImovel, parcelamento: await reg360Api.parcelamento(Number(d.parcelamento_id)) };
      }
      if (d.incorporacao_id) {
        const [inc, unidades] = await Promise.all([
          reg360Api.incorporacao(Number(d.incorporacao_id)),
          reg360Api.unidades({ incorporacao_id: Number(d.incorporacao_id) }),
        ]);
        this.paiDoImovel = { ...this.paiDoImovel, incorporacao: inc };
        // A própria unidade aberta não entra na lista de irmãs.
        this.unidadesDoLote = unidades.filter((u: any) => Number(u.id) !== Number(d.id));
      }
    } catch (e: any) {
      // Contexto ausente degrada rótulo, não a tela.
      this._registrarFalha(e, 'Falha ao carregar o contexto do imóvel');
    }
  }

  /**
   * Dados de regularização de todos os parcelamentos, numa requisição. São 60
   * registros no máximo — sem isso, os chips de fase e os badges dos cards
   * fariam 60 chamadas.
   */
  private async _carregarRegularizacao() {
    if (this.regularizacaoPorParcelamento.size > 0) return;
    try {
      const { dados } = await reg360Api.listarParcelamentoDados();
      this.regularizacaoPorParcelamento = new Map(
        (dados || []).map((d: any) => [Number(d.parcelamento_id), d]),
      );
    } catch (e: any) {
      this._registrarFalha(e, 'Falha ao carregar dados de regularização');
    }
  }

  /** Fase do parcelamento. Sem registro, é `irregular` — o estado inicial. */
  private _faseDe(parcelamentoId: unknown) {
    return faseRegularizacao(this.regularizacaoPorParcelamento.get(Number(parcelamentoId)));
  }

  private get podeEditarRegularizacao(): boolean {
    const ctx = urbiVerso.contexto?.();
    const roles = ctx?.roles || ctx?.rolesApp || [];
    return ctx?.nivel === 'admin' || ctx?.nivelApp === 'admin' || roles.includes('editor_regularizacao');
  }

  private _abrirFormRegularizacao() {
    const p = this.detalhe;
    const atual = this.regularizacaoPorParcelamento.get(Number(p?.id)) || {};
    this.formReg = {
      numero_decreto: atual.numero_decreto ?? '',
      matricula_id: atual.matricula_id ?? '',
      area_poligonal: atual.area_poligonal ?? '',
      area_viario: atual.area_viario ?? '',
      area_servidao: atual.area_servidao ?? '',
      data_envio_projeto: soData(atual.data_envio_projeto) ?? '',
      data_aprovacao_conplan: soData(atual.data_aprovacao_conplan) ?? '',
      data_decreto_gdf: soData(atual.data_decreto_gdf) ?? '',
      situacao_registral: atual.situacao_registral ?? 'nenhuma',
      observacao: atual.observacao ?? '',
    };
    this.formRegAberto = true;
  }

  private async _salvarRegularizacao() {
    const p = this.detalhe;
    if (!p?.id) return;
    // Campo vazio vira null, não string vazia: "limpar" é uma intenção, e o
    // backend recusaria '' como data.
    const corpo: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.formReg)) {
      corpo[k] = v === '' ? null : v;
    }
    try {
      this.carregando = true;
      const salvo = await reg360Api.salvarParcelamentoDados(Number(p.id), corpo);
      const mapa = new Map(this.regularizacaoPorParcelamento);
      mapa.set(Number(p.id), salvo);
      this.regularizacaoPorParcelamento = mapa;
      this.formRegAberto = false;
      urbiVerso.notificar?.('Regularização atualizada', 'sucesso');
    } catch (e: any) {
      urbiVerso.notificar?.(e?.message || 'Falha ao salvar regularização', 'erro');
    } finally {
      this.carregando = false;
    }
  }

  private async _carregarDadosDoImovel() {
    this.dadosDoImovel = {};
    if (!this.rota.id) return;
    try {
      this.dadosDoImovel = await reg360Api.imovelDados(this.rota.view, this.rota.id) || {};
    } catch (e: any) {
      this._registrarFalha(e, 'Falha ao carregar preços do imóvel');
    }
  }

  /**
   * Uma página de moradores. A busca é do SERVIDOR — ao contrário da lista de
   * parcelamentos, que filtra no cliente.
   *
   * A diferença não é gosto: 60 parcelamentos cabem em memória e a varredura já
   * os tem; ~2.873 pessoas não cabem confortavelmente, e o `busca` do Núcleo já
   * cobre nome e CPF, que são os dois campos que importam aqui. O preço é o
   * conhecido: ILIKE não cruza acento, então `jose` não acha `José`.
   */
  private async _carregarMoradores(pagina: number) {
    this.carregando = true;
    try {
      const r: any = await reg360Api.pessoas(
        { busca: this.buscaMorador.trim() || undefined, tipo: 'fisica' },
        pagina,
      );
      this.moradores = r?.dados || [];
      this.moradoresPagina = Number(r?.pagina) || pagina;
      this.moradoresPaginas = Number(r?.paginas) || 1;
      this.moradoresTotal = Number(r?.total) || this.moradores.length;
      void this._carregarContatos(this.moradores);
    } catch (e: any) {
      this._registrarFalha(e, 'Falha ao carregar moradores');
    } finally {
      this.carregando = false;
    }
  }

  /**
   * Telefones e emails das pessoas visíveis. Dois sub-recursos por pessoa, em
   * janela de simultâneos — é o mesmo custo por linha dos ocupantes do lote, e
   * pela mesma razão: o Núcleo não expande contato na listagem.
   */
  private async _carregarContatos(pessoas: any[]) {
    const alvo = (pessoas || []).filter((p) => p && !this.contatosPorPessoa.has(Number(p.id)));
    if (alvo.length === 0) return;
    const resultados = await mapaComLimite(alvo, 6, async (p: any) => {
      const id = Number(p.id);
      try {
        const [telefones, emails] = await Promise.all([
          reg360Api.telefonesDaPessoa(id),
          reg360Api.emailsDaPessoa(id),
        ]);
        return [id, { telefones, emails }] as [number, { telefones: any[]; emails: any[] }];
      } catch {
        // Uma pessoa que falha não derruba a página. Ela fica sem contato
        // CONSULTADO, e a situação dela sai indeterminada — que é a verdade.
        return null;
      }
    });
    const mapa = new Map(this.contatosPorPessoa);
    for (const r of resultados) if (r) mapa.set(r[0], r[1]);
    this.contatosPorPessoa = mapa;
  }

  /**
   * Monta o índice reverso pessoa → imóveis para UM parcelamento.
   *
   * O Núcleo expõe `imovel_pessoas` só pelo lado do imóvel — não há rota de
   * pessoa → imóveis nem filtro `pessoa_id` em `/imoveis` ou `/lotes`. Então o
   * reverso se monta lendo os ocupantes de cada lote, uma requisição por lote.
   *
   * Por isso o recorte é do usuário e não automático: um parcelamento custa
   * ~100 requisições e é útil; a instância inteira custaria ~6.200 e travaria a
   * tela. É a mesma decisão da busca por morador dentro do parcelamento — o
   * usuário escolhe pagar o custo, a tela não o cobra por conta própria.
   */
  private async _indexarParcelamento(parcelamentoId: number | null) {
    if (this.indexando) return;
    if (parcelamentoId === null) {
      this.parcelamentoIndexado = null;
      this.imoveisPorPessoa = new Map();
      this.lotesQueFalharam = 0;
      return;
    }
    this.indexando = true;
    try {
      const lotes = await reg360Api.lotes({ parcelamento_id: parcelamentoId });
      // Lote que falha NÃO vira lote sem ocupante. Engolir o erro como lista
      // vazia esconderia moradores reais e ainda apresentaria o recorte como
      // completo — a tela diria "nenhum imóvel" para quem tem um.
      const pares = await mapaComLimite(lotes, 6, async (l: any) => {
        try {
          return { imovel: l, vinculos: await reg360Api.pessoasDoLote(Number(l.id)), falhou: false };
        } catch {
          return { imovel: l, vinculos: [], falhou: true };
        }
      });
      this.lotesQueFalharam = pares.filter((r) => r.falhou).length;
      this.imoveisPorPessoa = indexarPorPessoa(pares.filter((r) => !r.falhou));
      this.parcelamentoIndexado = parcelamentoId;
    } catch (e: any) {
      this.parcelamentoIndexado = null;
      this.lotesQueFalharam = 0;
      this._registrarFalha(e, 'Falha ao indexar o parcelamento');
    } finally {
      this.indexando = false;
    }
  }

  /**
   * Situação de uma pessoa, com o que se sabe DELA.
   *
   * **Ausência do índice nunca vira `[]`.** O índice cobre UM parcelamento, e a
   * tabela lista as pessoas da instância inteira: quem está vinculada só a
   * outro parcelamento não aparece no mapa, e traduzir isso para "consultado e
   * sem vínculo" a marcaria `incompleto` — o erro exato que os três estados
   * existem para impedir, reintroduzido uma camada acima.
   *
   * Só o que está NO mapa é conhecido. E quem está no mapa tem vínculo por
   * construção — ela só entrou ali porque um lote a listou —, então este ecrã
   * nunca conclui "não tem vínculo". Ele não pode: provar ausência global de
   * vínculo exigiria varrer a instância toda.
   */
  private _situacaoDe(p: any): Situacao {
    const id = Number(p?.id);
    return situacaoCadastro(p, {
      contatos: this.contatosPorPessoa.get(id),
      vinculos: vinculosConhecidos(this.imoveisPorPessoa, id),
    });
  }

  /**
   * Ações do imóvel aberto.
   *
   * Uma requisição só: a rota devolve os vínculos de imóvel e de pessoa junto
   * com cada ação, então a tela não precisa buscar um por um. Ação sobre pessoa
   * sem imóvel **não** aparece aqui — ela vive na tela da pessoa, que a #33
   * ainda vai criar.
   */
  private async _carregarAcoes() {
    this.acoes = [];
    if (!this.rota.id) return;
    this.carregandoAcoes = true;
    try {
      const r = await reg360Api.listarAcoes({
        imovel_id: this.rota.id,
        imovel_tipo: this.rota.view,
      });
      this.acoes = r?.dados || [];
    } catch (e: any) {
      this._registrarFalha(e, 'Falha ao carregar as ações');
    } finally {
      this.carregandoAcoes = false;
    }
  }

  /** Ações que viram badge no cabeçalho: só as ativas. */
  private get _acoesEmDestaque(): Acao[] {
    return this.acoes.filter((a) => destacaNoCabecalho(a));
  }

  /**
   * Filtro por pessoa dentro da aba. A busca é sobre os ocupantes já conhecidos
   * do lote — o vínculo guarda `pessoa_id`, e o nome vem de `pessoasPorLote`.
   */
  private get _acoesFiltradas(): Acao[] {
    const alvo = normalizarTexto(this.buscaAcaoPessoa);
    if (!alvo) return this.acoes;
    return this.acoes.filter((a) =>
      (a.pessoas || []).some((v) => normalizarTexto(this._nomeDaPessoa(v.pessoa_id)).includes(alvo)),
    );
  }

  /**
   * Nome de uma pessoa vinculada, a partir dos ocupantes do lote.
   *
   * O vínculo aponta para o Núcleo por id lógico, e o backend não lê o Núcleo:
   * id que não resolve vira `#123`, à mostra, em vez de sumir da tela.
   */
  private _nomeDaPessoa(pessoaId: unknown): string {
    const id = Number(pessoaId);
    for (const lista of this.pessoasPorLote.values()) {
      const achada = (lista || []).find((v: any) => Number(v.pessoa_id) === id);
      if (achada) return String(achada.nome ?? achada.razao_social ?? `#${id}`);
    }
    return `#${id}`;
  }

  private async _acaoDeAcao(fn: () => Promise<any>, sucesso: string) {
    try {
      this.carregando = true;
      await fn();
      urbiVerso.notificar?.(sucesso, 'sucesso');
      await this._carregarAcoes();
    } catch (e: any) {
      urbiVerso.notificar?.(e?.message || 'Falha ao salvar a ação', 'erro');
    } finally {
      this.carregando = false;
    }
  }

  /**
   * Abre o formulário. Criando a partir do lote, o próprio lote já entra
   * vinculado — é o caso comum, e obrigar a selecioná-lo de novo seria pedir
   * ao usuário que repita o que a tela já sabe.
   */
  private _abrirFormAcao(existente?: Acao) {
    this.formAcao = existente
      ? { ...existente, editandoId: existente.id }
      : {
          tipo: 'revisional',
          polo: 'contra_up',
          status: 'ativa',
          data: '',
          numero_processo: '',
          valor: '',
          descricao: '',
          editandoId: null,
        };
  }

  private _salvarFormAcao() {
    const f = this.formAcao;
    if (!f) return;
    const corpo: NovaAcao = {
      tipo: String(f.tipo),
      polo: String(f.polo),
      status: String(f.status),
      data: f.data || null,
      numero_processo: f.numero_processo || null,
      valor: f.valor === '' || f.valor === null ? null : Number(String(f.valor).replace(',', '.')),
      descricao: f.descricao || null,
    };
    if (corpo.valor !== null && !Number.isFinite(corpo.valor)) {
      return urbiVerso.notificar?.('Valor inválido', 'erro');
    }
    const id = Number(this.rota.id);
    const editandoId = f.editandoId;
    this.formAcao = null;
    void this._acaoDeAcao(
      () => (editandoId
        ? reg360Api.editarAcao(Number(editandoId), corpo)
        // O imóvel aberto entra junto na criação — a rota exige ao menos um
        // vínculo, e criar-e-vincular em duas chamadas deixaria ação órfã se a
        // segunda falhasse.
        : reg360Api.criarAcao({ ...corpo, imoveis: [{ imovel_id: id, imovel_tipo: String(this.rota.view) }] })),
      editandoId ? 'Ação atualizada' : 'Ação registrada',
    );
  }

  /** Estado de quitação do imóvel aberto. Sem registro = não quitado. */
  private get _quitacao() {
    return lerQuitacao(this.dadosDoImovel);
  }

  /**
   * Botão de quitação. Só quem aprova proposta vê — quitação é constatação
   * financeira, não cadastro, e `criador` tomaria 403 se clicasse.
   *
   * Desmarcar pede confirmação: a marca é o registro de que alguém afirmou que
   * a dívida acabou, e desfazê-la por engano apaga essa afirmação junto com a
   * autoria.
   */
  private _renderBotaoQuitacao(): TemplateResult {
    const q = this._quitacao;
    const tipo = this.rota.view;
    const id = Number(this.rota.id);
    return html`
      <div class="barra-acoes">
        ${q.quitado
          ? html`<urbi-botao variante="perigo" pequeno icone="fa-solid fa-rotate-left"
              ?carregando=${this.carregando}
              @click=${() => {
                if (!confirm('Desmarcar a quitação apaga a data e o autor do registro. Continuar?')) return;
                void this._acaoPreco(() => reg360Api.desquitarImovel(tipo, id), 'Quitação desmarcada');
              }}>Desmarcar quitação</urbi-botao>`
          : html`<urbi-botao variante="sucesso" pequeno icone="fa-solid fa-circle-check"
              ?carregando=${this.carregando}
              @click=${() => this._acaoPreco(() => reg360Api.quitarImovel(tipo, id), 'Imóvel marcado como quitado')}>
              Marcar como quitado</urbi-botao>`}
      </div>
    `;
  }

  /** Preço que vale para o imóvel aberto, com a origem. */
  private get _precoDoImovel() {
    return precoAplicavel(this.dadosDoImovel, this.vigente?.vigente);
  }

  private async _acaoPreco(fn: () => Promise<any>, sucesso: string) {
    try {
      this.carregando = true;
      this.dadosDoImovel = await fn();
      // O preço deste imóvel entra no VGV do parcelamento e do setor.
      await this._recarregarBasesDoVgv();
      urbiVerso.notificar?.(sucesso, 'sucesso');
    } catch (e: any) {
      urbiVerso.notificar?.(e?.message || 'Falha ao salvar preço', 'erro');
    } finally {
      this.carregando = false;
    }
  }

  /** Lotes visíveis na página atual, já filtrados. */
  private get _lotesFiltrados(): any[] {
    const porQuitacao = (lista: any[]) => {
      if (this.filtroQuitacao === 'todos') return lista;
      // Base ausente NÃO filtra. Com `precosPorImovel` vazio, "Quitados"
      // devolveria lista vazia e "Não quitados" devolveria tudo — incluindo os
      // quitados. Aviso na tela não conserta resultado errado na tabela: ele só
      // explica um número que continua mentindo. Enquanto a base não chegou, o
      // filtro fica sem efeito, e a tela diz isso.
      if (!this.basesDoVgvCarregadas) return lista;
      const querQuitado = this.filtroQuitacao === 'quitados';
      // O dado vem da tabela do app, indexada por (tipo, id) — a mesma base que
      // o VGV carrega. Lote sem registro é não quitado, que é o caso normal e
      // não "desconhecido".
      return lista.filter((l) => {
        const d = this.precosPorImovel.get(chaveImovel(l?.id, 'lote'));
        return Boolean(d?.quitado) === querQuitado;
      });
    };
    return porQuitacao(this._lotesPorBusca);
  }

  private get _lotesPorBusca(): any[] {
    if (this.modoBusca === 'morador') {
      const alvo = normalizarTexto(this.termoBusca);
      if (!alvo) return this.lotes;
      return this.lotes.filter((l) =>
        (this.pessoasPorLote.get(Number(l.id)) || []).some((v: any) =>
          normalizarTexto(v?.nome ?? v?.razao_social).includes(alvo),
        ),
      );
    }
    return filtrarPorTexto(this.lotes, this.termoBusca, [
      'id_legivel', 'numero_lote', 'quadra', 'conjunto', 'rua',
    ]);
  }

  private get _lotesDaPagina(): any[] {
    const ini = (this.paginaLotes - 1) * LOTES_POR_PAGINA;
    return this._lotesFiltrados.slice(ini, ini + LOTES_POR_PAGINA);
  }

  /**
   * Ocupantes dos lotes visíveis. Uma requisição por lote (o Núcleo não expõe
   * `imovel_pessoas` em lote), com janela de simultâneos e cache por lote.
   */
  private async _carregarPessoasDaPagina(lotes?: any[]) {
    const alvo = (lotes ?? this._lotesDaPagina).filter((l) => !this.pessoasPorLote.has(Number(l.id)));
    if (alvo.length === 0) return;
    this.carregandoPessoas = true;
    try {
      const resultados = await mapaComLimite<any, [number, any[]]>(alvo, LIMITE_SIMULTANEO, async (l) => {
        try {
          return [Number(l.id), await reg360Api.pessoasDoLote(Number(l.id))];
        } catch {
          // Um lote que falha não derruba a página inteira.
          return [Number(l.id), []];
        }
      });
      const mapa = new Map(this.pessoasPorLote);
      for (const [id, pessoas] of resultados) mapa.set(id, pessoas);
      this.pessoasPorLote = mapa;
    } finally {
      this.carregandoPessoas = false;
    }
  }

  /**
   * Buscar por morador exige os ocupantes de TODO o parcelamento, porque o
   * filtro não existe no Núcleo. É por isso que o modo é escolhido
   * explicitamente, e não inferido do que o usuário digita.
   */
  private async _trocarModoBusca(modo: 'endereco' | 'morador') {
    this.modoBusca = modo;
    this.paginaLotes = 1;
    if (modo === 'morador') await this._carregarPessoasDaPagina(this.lotes);
  }

  /**
   * Propostas e preços por imóvel — as duas bases que faltam para o VGV.
   * Cada uma é uma varredura só, memorizada; o resto é conta no cliente.
   */
  private async _carregarBasesDoVgv() {
    if (this.basesDoVgvCarregadas || this.carregandoVgv) return;
    this.carregandoVgv = true;
    try {
      const [propostas, precos] = await Promise.all([
        reg360Api.listarTodasPropostas(),
        reg360Api.listarImovelDados('lote'),
      ]);
      this.vigentesPorAlvo = indexarPropostas(propostas, hoje());
      this.precosPorImovel = new Map(
        (precos?.dados || []).map((d: any) => [chaveImovel(d.imovel_id, d.imovel_tipo), d]),
      );
      this.basesDoVgvCarregadas = true;
    } catch (e: any) {
      this._registrarFalha(e, 'Falha ao carregar as bases de preço');
    } finally {
      this.carregandoVgv = false;
    }
  }

  /**
   * Gravar preço ou aprovar proposta muda o VGV de todo mundo, não só a tela
   * aberta: a base memorizada precisa cair junto, senão os cards continuam
   * exibindo o número anterior com cara de atual.
   */
  private async _recarregarBasesDoVgv() {
    if (!this.basesDoVgvCarregadas && !this.carregandoVgv) return;
    this.basesDoVgvCarregadas = false;
    this.vigentesPorAlvo = new Map();
    this.precosPorImovel = new Map();
    await this._carregarBasesDoVgv();
  }

  /** Setor de cada parcelamento — último elo da cascata no agregado. */
  private get _setorPorParcelamento(): Map<number, number> {
    const mapa = new Map(this.parcelamentos
      .filter((p) => p.setor_habitacional_id)
      .map((p) => [Number(p.id), Number(p.setor_habitacional_id)]));
    // Abrir `/parcelamento/:id` direto não passa pela lista, então
    // `this.parcelamentos` está vazio e o elo de Setor da cascata sumiria — e é
    // no Setor que mora o preço-base que quase sempre existe. O par vem do
    // próprio detalhe, que já traz `setor_habitacional_id`: nenhuma requisição
    // a mais.
    const d = this.detalhe;
    if (this.rota.view === 'parcelamento' && d?.id && d?.setor_habitacional_id) {
      mapa.set(Number(d.id), Number(d.setor_habitacional_id));
    }
    return mapa;
  }

  private _agregarLotes(lotes: any[]): Agregado {
    return agregarImoveis(lotes, {
      dadosPorImovel: this.precosPorImovel,
      vigentes: this.vigentesPorAlvo,
      setorPorParcelamento: this._setorPorParcelamento,
    });
  }

  /** Agregado de um parcelamento, a partir da varredura já feita. */
  private _agregadoDoParcelamento(parcelamentoId: unknown): Agregado {
    const id = Number(parcelamentoId);
    return this._agregarLotes(this.todosOsLotes.filter((l) => Number(l.parcelamento_id) === id));
  }

  /**
   * O VGV é dito sobre QUANTOS imóveis ele foi calculado. Um número que ignora
   * silenciosamente parte dos lotes é pior que nenhum número.
   */
  private _rotuloCobertura(a: Agregado): string {
    if (a.quantidade === 0) return '';
    if (a.comValor === a.quantidade) return `sobre os ${a.quantidade} lotes`;
    const fora: string[] = [];
    if (a.semPreco) fora.push(`${a.semPreco} sem preço`);
    if (a.semArea) fora.push(`${a.semArea} sem área`);
    return `sobre ${a.comValor} de ${a.quantidade} lotes — ${fora.join(', ')}`;
  }

  /** Agregado de um conjunto de parcelamentos (setor, ou a instância toda). */
  private _agregar(parcelamentos: any[]) {
    let quantidade = 0;
    let area = 0;
    for (const p of parcelamentos) {
      const a = this.porParcelamento.get(Number(p?.id));
      if (!a) continue;
      quantidade += a.quantidade;
      area += a.area;
    }
    return { quantidade, area };
  }

  private async _carregarPropostas(nivel: string, refId: number) {
    this.propostas = (await reg360Api.listarPropostas({ nivel, ref_id: refId })).dados || [];
  }

  // -------------------------------------------------------------------------
  // Ações
  // -------------------------------------------------------------------------

  private _abrirCriar(nivel: string, refId: number) {
    this.formModo = 'criar';
    this.formOrigemId = null;
    this.formNivel = nivel;
    this.formRefId = refId;
    this.form = { tipo_proposta: 'tabela' };
    this.formAberto = true;
  }

  private _abrirCopiar(p: Proposta) {
    this.formModo = 'copiar';
    this.formOrigemId = p.id;
    this.formNivel = p.nivel;
    this.formRefId = p.ref_id;
    this.form = {
      titulo: `${p.titulo} (cópia)`,
      descricao: p.descricao,
      tipo_proposta: p.tipo_proposta,
      data_proposta: soData(p.data_proposta),
      data_fim_vigencia: soData(p.data_fim_vigencia),
      preco_m2: p.preco_m2,
      preco_minimo_residencial: p.preco_minimo_residencial,
      preco_minimo_comercial_misto: p.preco_minimo_comercial_misto,
      desconto_a_vista: p.desconto_a_vista,
      desconto_6x: p.desconto_6x,
      desconto_12x: p.desconto_12x,
      desconto_lote_grande: p.desconto_lote_grande,
      lote_grande_m2: p.lote_grande_m2,
    };
    this.formAberto = true;
  }

  private _campo(nome: string, valor: any) {
    this.form = { ...this.form, [nome]: valor };
  }

  private async _salvarForm() {
    const corpo: Partial<Proposta> = {
      ...this.form,
      nivel: this.formNivel as any,
      ref_id: this.formRefId,
    };
    try {
      this.carregando = true;
      if (this.formModo === 'copiar' && this.formOrigemId) {
        await reg360Api.copiarProposta(this.formOrigemId, corpo);
      } else {
        await reg360Api.criarProposta(corpo);
      }
      urbiVerso.notificar?.('Proposta salva', 'sucesso');
      this.formAberto = false;
      await this._carregarPropostas(this.formNivel, this.formRefId);
      await this._recarregarBasesDoVgv();
    } catch (e: any) {
      urbiVerso.notificar?.(e?.message || 'Falha ao salvar proposta', 'erro');
    } finally {
      this.carregando = false;
    }
  }

  private async _aprovar(p: Proposta) {
    try {
      await reg360Api.aprovarProposta(p.id);
      urbiVerso.notificar?.('Proposta aprovada', 'sucesso');
      await this._carregarPropostas(p.nivel, p.ref_id);
      // Aprovar é o que torna a proposta vigente — é a mutação que mais muda
      // o VGV, e a que mais enganaria se a base continuasse a antiga.
      await this._recarregarBasesDoVgv();
    } catch (e: any) {
      urbiVerso.notificar?.(e?.message || 'Falha ao aprovar', 'erro');
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  render() {
    const abaTopo =
      this.rota.view === 'parcelamentos' || this.rota.view === 'parcelamento' ? 'parcelamentos'
      : this.rota.view === 'unidades' || this.rota.view === 'unidade' ? 'unidades'
      : this.rota.view === 'moradores' || this.rota.view === 'morador' ? 'moradores'
      : 'regularizacao';

    return html`
      <urbi-shell-page titulo="Regularização 360">
        <urbi-abas
          .abas=${[
            { id: 'regularizacao', label: 'Regularização', icone: 'fa-solid fa-city' },
            { id: 'parcelamentos', label: 'Parcelamentos', icone: 'fa-solid fa-map' },
            { id: 'unidades', label: 'Unidades', icone: 'fa-solid fa-house' },
            { id: 'moradores', label: 'Moradores', icone: 'fa-solid fa-users' },
          ]}
          ativa=${abaTopo}
          @urbi:aba-selecionar=${(e: CustomEvent) => {
            const id = e.detail.id;
            this._navegar(id === 'regularizacao' ? '/' : `/${id}`);
          }}
        ></urbi-abas>

        ${this.avisoFlag ? this._renderAvisoFlag(this.avisoFlag) : nothing}
        ${this.erro ? html`<p class="erro">${this.erro}</p>` : nothing}
        ${this._renderView()}
      </urbi-shell-page>
      ${this.formAberto ? this._renderForm() : nothing}
      ${this.formRegAberto ? this._renderFormRegularizacao() : nothing}
      ${this.formPreco ? this._renderFormPreco() : nothing}
      ${this.formAcao ? this._renderFormAcao() : nothing}
    `;
  }

  /**
   * Os dois 403 do gate de flags têm remédios diferentes, e a tela precisa
   * dizer qual é qual: toggle que o admin não ligou é operação; flag não
   * pedida é bug do manifesto. Em nenhum dos casos é "nenhum registro".
   */
  private _renderAvisoFlag(f: FalhaDeFlag): TemplateResult {
    return html`
      <urbi-banner variante="alerta">
        ${f.mensagem}
        ${f.precisaDeAdmin
          ? html`<br /><small>Peça a quem administra a instância para habilitar o acesso em
              <strong>Admin → Apps → reg360 → Núcleo</strong>.</small>`
          : html`<br /><small>O manifesto da app não declara essa permissão — é preciso corrigir o app,
              não a instância.</small>`}
      </urbi-banner>
    `;
  }

  private _renderView(): TemplateResult {
    switch (this.rota.view) {
      case 'home': return this._renderHome();
      case 'parcelamentos': return this._renderListaParcelamentos();
      case 'unidades': return this._renderListaUnidades();
      case 'moradores': return this._renderMoradores();
      case 'morador': return this._renderDetalheMorador();
      case 'setor': return this._renderDetalheSetor();
      case 'parcelamento': return this._renderDetalheParcelamento();
      case 'lote':
      case 'unidade': return this._renderDetalheImovel();
      case 'proposta': return this._renderProposta();
      default: return html`${nothing}`;
    }
  }

  private _renderHome(): TemplateResult {
    if (this.carregando && this.setores.length === 0) return html`<urbi-loading></urbi-loading>`;
    if (this.setores.length === 0) return html`<urbi-estado-vazio icone="fa-solid fa-city" mensagem="Nenhum setor habitacional"></urbi-estado-vazio>`;
    return html`
      <urbi-grid min="240px" gap="12px">
        ${this.setores.map((sh) => {
          const doSetor = this.parcelamentos.filter((p) => p.setor_habitacional_id === sh.id);
          const ag = this._agregar(doSetor);
          return html`
            <urbi-card
              clicavel
              titulo=${nomeDe(sh)}
              @urbi:card-click=${() => this._navegar(`/setor/${sh.id}`)}
            >
              <urbi-stack>
                <div class="prop-meta">${sh.slug ?? ''}</div>
                <div>${doSetor.length} ${doSetor.length === 1 ? 'parcelamento' : 'parcelamentos'}</div>
                <div class="prop-meta">${this._rotuloLotes(ag.quantidade)}</div>
              </urbi-stack>
            </urbi-card>
          `;
        })}
      </urbi-grid>
    `;
  }

  /**
   * A varredura de lotes é assíncrona: enquanto ela não termina, dizer
   * "0 lotes" seria mentira. Distingue-se "ainda contando" de "nenhum".
   */
  private _rotuloLotes(quantidade: number): string {
    if (this.varrendoLotes && this.porParcelamento.size === 0) return 'contando lotes…';
    return `${quantidade.toLocaleString('pt-BR')} ${quantidade === 1 ? 'lote' : 'lotes'}`;
  }

  /** Nome do Setor a partir do id. Card nenhum exibe id cru. */
  private _nomeSetor(id: unknown): string | null {
    const sh = this.setores.find((s) => s.id === Number(id));
    return sh ? nomeDe(sh) : null;
  }

  private _renderListaParcelamentos(): TemplateResult {
    let base = this.parcelamentos;
    if (this.rota.filtroSetor) base = base.filter((p) => p.setor_habitacional_id === this.rota.filtroSetor);
    if (this.rota.filtroFase) base = base.filter((p) => this._faseDe(p.id) === this.rota.filtroFase);
    const filtrados = filtrarPorTexto(base, this.termoBusca, ['nome', 'slug']);

    // Situação registral só vira faixa de chips onde ela existe nos dados —
    // chip que nunca filtra nada é ruído.
    const situacoesPresentes = SITUACOES_REGISTRAIS.filter((op) =>
      situacaoRegistralRelevante(op.id)
      && this.parcelamentos.some((p) => this.regularizacaoPorParcelamento.get(Number(p.id))?.situacao_registral === op.id));

    return html`
      <urbi-chips-atalho
        .opcoes=${this.setores.map((sh) => ({ id: String(sh.id), rotulo: nomeDe(sh) }))}
        ativo=${this.rota.filtroSetor ? String(this.rota.filtroSetor) : ''}
        @urbi:chip-atalho:click=${(e: CustomEvent) => {
          // Clicar no chip ativo desliga o filtro.
          const id = Number(e.detail.id);
          this._navegar(this.rota.filtroSetor === id ? '/parcelamentos' : `/parcelamentos/setor/${id}`);
        }}
      ></urbi-chips-atalho>

      <urbi-chips-atalho
        .opcoes=${FASES.map((f) => ({ id: f.id, rotulo: f.rotulo }))}
        ativo=${this.rota.filtroFase ?? ''}
        @urbi:chip-atalho:click=${(e: CustomEvent) => {
          const id = String(e.detail.id);
          this._navegar(this.rota.filtroFase === id ? '/parcelamentos' : `/parcelamentos/fase/${id}`);
        }}
      ></urbi-chips-atalho>

      ${situacoesPresentes.length > 0
        ? html`<urbi-wrap>${situacoesPresentes.map((op) => html`
            <urbi-badge cor=${op.cor}>${op.rotulo}: ${this.parcelamentos.filter((p) =>
              this.regularizacaoPorParcelamento.get(Number(p.id))?.situacao_registral === op.id).length}</urbi-badge>`)}
          </urbi-wrap>`
        : nothing}

      <urbi-input
        label="Buscar por nome ou sigla"
        .valor=${this.termoBusca}
        @urbi:input-change=${(e: CustomEvent) => { this.termoBusca = String(e.detail.valor ?? ''); }}
      ></urbi-input>

      ${this.carregando && this.parcelamentos.length === 0
        ? html`<urbi-loading></urbi-loading>`
        : filtrados.length === 0
          ? html`<urbi-estado-vazio
              icone="fa-solid fa-map"
              mensagem=${this.parcelamentos.length === 0 ? 'Nenhum parcelamento' : 'Nenhum parcelamento com esse filtro'}
              submensagem=${this.parcelamentos.length === 0 ? '' : 'Ajuste a busca ou troque o setor.'}
            ></urbi-estado-vazio>`
          : html`
            <urbi-grid min="260px" gap="12px">
              ${filtrados.map((p) => {
                const b = badgeFase(this._faseDe(p.id));
                const sit = this.regularizacaoPorParcelamento.get(Number(p.id))?.situacao_registral;
                const setor = this._nomeSetor(p.setor_habitacional_id);
                const ag = this.porParcelamento.get(Number(p.id));
                return html`
                  <urbi-card
                    clicavel
                    titulo=${nomeDe(p)}
                    @urbi:card-click=${() => this._navegar(`/parcelamento/${p.id}`)}
                  >
                    <urbi-stack>
                      <urbi-wrap>
                        ${setor ? html`<urbi-badge cor="padrao">${setor}</urbi-badge>` : nothing}
                        <urbi-badge cor=${b.cor}>${b.rotulo}</urbi-badge>
                        ${situacaoRegistralRelevante(sit)
                          ? html`<urbi-badge cor=${badgeSituacaoRegistral(sit).cor}>${badgeSituacaoRegistral(sit).rotulo}</urbi-badge>`
                          : nothing}
                      </urbi-wrap>
                      <div class="prop-meta">${p.slug ?? ''}</div>
                      <div>${this._rotuloLotes(ag?.quantidade ?? 0)}</div>
                      <div class="prop-meta">Área: ${fmtArea(p.area)} m²</div>
                      ${(() => {
                        const a = this._agregadoDoParcelamento(p.id);
                        if (a.quantidade === 0) return nothing;
                        return html`<div><strong>VGV: ${fmtMoeda(a.vgv)}</strong>
                          <span class="prop-meta"> ${this._rotuloCobertura(a)}</span></div>`;
                      })()}
                    </urbi-stack>
                  </urbi-card>
                `;
              })}
            </urbi-grid>`}
    `;
  }

  private _renderListaUnidades(): TemplateResult {
    return html`
      <urbi-tabela
        clicavel
        ?carregando=${this.carregando}
        mensagemVazio="Nenhuma unidade"
        .colunas=${[
          { id: 'ident', label: 'Identificação', valor: (l: any) => nomeDe(l) },
          { id: 'bloco', label: 'Bloco', valor: (l: any) => String(l.bloco ?? '—') },
          { id: 'area', label: 'Área (m²)', alinhamento: 'direita', valor: (l: any) => String(l.area_efetiva ?? l.area ?? '—') },
        ]}
        .linhas=${this.unidades}
        @urbi:tabela-click=${(e: CustomEvent) => this._navegar(`/unidade/${e.detail.linha.id}`)}
      ></urbi-tabela>
    `;
  }

  private _renderDetalheSetor(): TemplateResult {
    const sh = this.detalhe;
    if (!sh) return html`<urbi-loading></urbi-loading>`;
    const ag = this._agregar(this.parcelamentos);
    return html`
      <urbi-botao variante="fantasma" icone="fa-solid fa-arrow-left" pequeno @click=${() => this._navegar('/')}>Voltar</urbi-botao>
      <h2>${nomeDe(sh)}</h2>
      <urbi-wrap>
        <urbi-kpi rotulo="Parcelamentos" .valor=${this.parcelamentos.length} formato="numero"></urbi-kpi>
        <urbi-kpi rotulo="Lotes" .valor=${this._rotuloLotes(ag.quantidade)} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Área dos lotes (m²)" .valor=${fmtArea(ag.area)} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Propostas aprovadas" .valor=${this.propostas.filter((p) => p.status_aprovacao === 'aprovada').length} formato="numero"></urbi-kpi>
      </urbi-wrap>
      ${this._renderVgv(somarAgregados(this.parcelamentos.map((p) => this._agregadoDoParcelamento(p.id))))}
      <urbi-abas
        .abas=${[
          { id: 'empreendimentos', label: 'Empreendimentos' },
          { id: 'propostas', label: 'Propostas Vigentes' },
        ]}
        ativa=${this.abaDetalhe}
        @urbi:aba-selecionar=${(e: CustomEvent) => { this.abaDetalhe = e.detail.id; }}
      ></urbi-abas>
      ${this.abaDetalhe === 'empreendimentos'
        ? html`<urbi-tabela clicavel
            .colunas=${[
              { id: 'nome', label: 'Nome', valor: (l: any) => nomeDe(l) },
              { id: 'status', label: 'Status', render: (l: any) => { const b = badgeStatusParcelamento(l.status); return html`<urbi-badge cor=${b.cor}>${b.label}</urbi-badge>`; } },
            ]}
            .linhas=${this.parcelamentos}
            @urbi:tabela-click=${(e: CustomEvent) => this._navegar(`/parcelamento/${e.detail.linha.id}`)}
          ></urbi-tabela>`
        : this._renderPropostasVigentes('setor', sh.id)}
    `;
  }

  private _renderDetalheParcelamento(): TemplateResult {
    const p = this.detalhe;
    if (!p) return html`<urbi-loading></urbi-loading>`;
    const reg = this.regularizacaoPorParcelamento.get(Number(p.id)) || {};
    const fase = badgeFase(this._faseDe(p.id));
    const bNucleo = badgeStatusParcelamento(p.status);
    const setor = this._nomeSetor(p.setor_habitacional_id);
    const areaLotes = this.lotes.reduce((soma, l) => soma + (Number(l.area_efetiva ?? l.area ?? 0) || 0), 0);
    const mat = this.matriculasPorId.get(Number(reg.matricula_id));
    return html`
      <urbi-botao variante="fantasma" icone="fa-solid fa-arrow-left" pequeno @click=${() => this._navegar('/parcelamentos')}>Voltar</urbi-botao>
      <h2>${nomeDe(p)}</h2>
      <urbi-wrap>
        ${setor ? html`<urbi-badge cor="padrao">${setor}</urbi-badge>` : nothing}
        <urbi-badge cor=${fase.cor}>${fase.rotulo}</urbi-badge>
        ${situacaoRegistralRelevante(reg.situacao_registral)
          ? html`<urbi-badge cor=${badgeSituacaoRegistral(reg.situacao_registral).cor}>${badgeSituacaoRegistral(reg.situacao_registral).rotulo}</urbi-badge>`
          : nothing}
      </urbi-wrap>
      <div class="prop-meta">
        ${p.slug ?? ''} · Nº Decreto: <strong>${reg.numero_decreto || '—'}</strong>
        · Matrícula-mãe: ${mat ? nomeDe(mat) : (reg.matricula_id ? '…' : '—')}
        · Registro no Núcleo: ${bNucleo.label}
      </div>
      ${this.podeEditarRegularizacao
        ? html`<div class="barra-acoes">
            <urbi-botao variante="secundario" pequeno icone="fa-solid fa-pen"
              @click=${() => this._abrirFormRegularizacao()}>Editar regularização</urbi-botao>
          </div>`
        : nothing}
      <urbi-wrap>
        <urbi-kpi rotulo="Lotes" .valor=${this.lotes.length} formato="numero"></urbi-kpi>
        <urbi-kpi rotulo="Área do parcelamento (m²)" .valor=${fmtArea(p.area)} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Área dos lotes (m²)" .valor=${fmtArea(areaLotes)} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Área poligonal (m²)" .valor=${fmtArea(reg.area_poligonal)} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Área de viário (m²)" .valor=${fmtArea(reg.area_viario)} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Área de servidão (m²)" .valor=${fmtArea(reg.area_servidao)} formato="texto"></urbi-kpi>
      </urbi-wrap>
      ${this._renderVgv(this._agregarLotes(this.lotes))}
      <urbi-abas
        .abas=${[
          { id: 'lotes', label: 'Lotes' },
          { id: 'propostas', label: 'Propostas Vigentes' },
        ]}
        ativa=${this.abaDetalhe}
        @urbi:aba-selecionar=${(e: CustomEvent) => { this.abaDetalhe = e.detail.id; }}
      ></urbi-abas>
      ${this.abaDetalhe === 'lotes' ? this._renderTabelaLotes() : this._renderPropostasVigentes('parcelamento', p.id)}
    `;
  }

  private _renderTabelaLotes(): TemplateResult {
    const filtrados = this._lotesFiltrados;
    const daPagina = this._lotesDaPagina;
    const paginas = Math.max(1, Math.ceil(filtrados.length / LOTES_POR_PAGINA));
    return html`
      <urbi-wrap>
        <urbi-chips-atalho
          .opcoes=${[
            { id: 'endereco', rotulo: 'Buscar por endereço' },
            { id: 'morador', rotulo: 'Buscar por morador' },
          ]}
          ativo=${this.modoBusca}
          @urbi:chip-atalho:click=${(e: CustomEvent) => this._trocarModoBusca(e.detail.id)}
        ></urbi-chips-atalho>
        <urbi-chips-atalho
          .opcoes=${[
            { id: 'todos', rotulo: 'Todos' },
            { id: 'quitados', rotulo: 'Quitados' },
            { id: 'nao_quitados', rotulo: 'Não quitados' },
          ]}
          ativo=${this.filtroQuitacao}
          @urbi:chip-atalho:click=${(e: CustomEvent) => {
            this.filtroQuitacao = e.detail.id;
            this.paginaLotes = 1;
            // O filtro traz para a página 1 lotes que não estavam visíveis, e
            // os ocupantes deles nunca foram buscados. Sem isto a coluna
            // Pessoas fica em `…` para sempre — e `…` significa "ainda não
            // sei", então seria mentira permanente.
            void this._carregarPessoasDaPagina();
          }}
        ></urbi-chips-atalho>
      </urbi-wrap>
      ${this.filtroQuitacao !== 'todos' && !this.basesDoVgvCarregadas
        ? html`<p class="prop-meta">
            ${this.carregandoVgv
              ? 'Carregando os dados de quitação — o filtro ainda não está valendo.'
              : 'Os dados de quitação não carregaram, então este filtro está sem efeito: a lista abaixo é a completa.'}
          </p>`
        : nothing}
      <urbi-input
        label=${this.modoBusca === 'morador' ? 'Nome do morador' : 'Endereço (quadra, conjunto, rua, lote)'}
        .valor=${this.termoBusca}
        @urbi:input-change=${(e: CustomEvent) => {
          this.termoBusca = String(e.detail.valor ?? '');
          this.paginaLotes = 1;
          // Mesma razão do chip de quitação: filtrar traz lotes novos para a
          // página 1, e sem isto a coluna Pessoas deles ficaria em `…` para
          // sempre. Defeito que já existia antes deste PR.
          void this._carregarPessoasDaPagina();
        }}
      ></urbi-input>
      ${this.modoBusca === 'morador' && this.carregandoPessoas
        ? html`<p class="prop-meta">Carregando ocupantes do parcelamento…</p>`
        : nothing}

      <urbi-tabela
        clicavel
        ?carregando=${this.carregando && this.lotes.length === 0}
        mensagemVazio=${this.lotes.length === 0 ? 'Nenhum lote neste parcelamento' : 'Nenhum lote com esse filtro'}
        .colunas=${[
          { id: 'endereco', label: 'Endereço', valor: (l: any) => nomeDe(l) },
          { id: 'matricula', label: 'Matrícula', valor: (l: any) => {
              const m = this.matriculasPorId.get(Number(l.matricula_id));
              return m ? nomeDe(m) : (l.matricula_id ? '…' : '—');
            } },
          { id: 'area', label: 'Área (m²)', alinhamento: 'direita', valor: (l: any) => fmtArea(l.area_efetiva ?? l.area) },
          { id: 'pessoas', label: 'Pessoas', render: (l: any) => {
              const vinculos = this.pessoasPorLote.get(Number(l.id));
              if (!vinculos) return html`<span class="prop-meta">…</span>`;
              if (vinculos.length === 0) return html`<span class="prop-meta">—</span>`;
              return html`<urbi-wrap>${vinculos.map((v: any) =>
                html`<urbi-badge cor="padrao">${v.nome ?? v.razao_social ?? `#${v.pessoa_id}`}</urbi-badge>`)}</urbi-wrap>`;
            } },
        ]}
        .linhas=${daPagina}
        @urbi:tabela-click=${(e: CustomEvent) => this._navegar(`/lote/${e.detail.linha.id}`)}
      ></urbi-tabela>

      ${paginas > 1
        ? html`<div class="barra-acoes">
            <urbi-botao variante="fantasma" pequeno ?desabilitado=${this.paginaLotes <= 1}
              @click=${() => this._irParaPaginaLotes(this.paginaLotes - 1)}>Anterior</urbi-botao>
            <span class="prop-meta">Página ${this.paginaLotes} de ${paginas} · ${filtrados.length} lotes</span>
            <urbi-botao variante="fantasma" pequeno ?desabilitado=${this.paginaLotes >= paginas}
              @click=${() => this._irParaPaginaLotes(this.paginaLotes + 1)}>Próxima</urbi-botao>
          </div>`
        : nothing}
    `;
  }

  private _irParaPaginaLotes(pagina: number) {
    this.paginaLotes = pagina;
    void this._carregarPessoasDaPagina();
  }

  /**
   * Detalhe de Lote ou Unidade. Na prática quase sempre Lote: no Núcleo,
   * `unidades` só existe sob incorporação, e a maioria dos lotes não tem uma.
   */
  private _renderDetalheImovel(): TemplateResult {
    const u = this.detalhe;
    if (!u) return html`<urbi-loading></urbi-loading>`;
    const ehLote = this.rota.view === 'lote';
    const mat = this.matriculasPorId.get(Number(u.matricula_id));
    const ocupantes = this.pessoasPorLote.get(Number(u.id)) || [];
    const voltar = ehLote && u.parcelamento_id ? `/parcelamento/${u.parcelamento_id}` : '/parcelamentos';
    return html`
      <urbi-botao variante="fantasma" icone="fa-solid fa-arrow-left" pequeno @click=${() => this._navegar(voltar)}>Voltar</urbi-botao>
      <h2>${nomeDe(u)}</h2>
      <urbi-wrap>
        ${this.paiDoImovel.parcelamento
          ? html`<urbi-badge cor="padrao">${nomeDe(this.paiDoImovel.parcelamento)}</urbi-badge>`
          : nothing}
        ${this.paiDoImovel.incorporacao
          ? html`<urbi-badge cor="info">${nomeDe(this.paiDoImovel.incorporacao)}</urbi-badge>`
          : nothing}
        ${this._acoesEmDestaque.map((a) => {
          const b = badgeAcao(a);
          return html`<urbi-badge cor=${b.cor}>${b.rotulo}</urbi-badge>`;
        })}
        ${this._quitacao.quitado
          ? html`<urbi-badge cor="sucesso">Quitado${this._quitacao.em ? ` em ${soData(this._quitacao.em)}` : ''}${this._quitacao.porNome ? ` · ${this._quitacao.porNome}` : ''}</urbi-badge>`
          : nothing}
      </urbi-wrap>
      ${this.podeAprovar ? this._renderBotaoQuitacao() : nothing}
      ${ocupantes.length > 0
        ? html`<urbi-wrap>${ocupantes.map((v: any) =>
            html`<urbi-badge cor="padrao">${v.nome ?? v.razao_social ?? `#${v.pessoa_id}`}${v.legado ? ' (legado)' : ''}</urbi-badge>`)}</urbi-wrap>`
        : html`<p class="prop-meta">Nenhum morador vinculado.</p>`}
      ${this._renderPainelPrecos(u)}
      <urbi-wrap>
        <urbi-kpi rotulo="Área (m²)" .valor=${fmtArea(u.area_efetiva ?? u.area)} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Matrícula" .valor=${mat ? nomeDe(mat) : '—'} formato="texto"></urbi-kpi>
      </urbi-wrap>
      ${this.unidadesDoLote.length > 0
        ? html`
            <p class="secao-titulo">Unidades desta incorporação</p>
            <urbi-tabela
              clicavel
              .colunas=${[
                { id: 'ident', label: 'Unidade', valor: (l: any) => nomeDe(l) },
                { id: 'tipologia', label: 'Tipologia', valor: (l: any) => String(l.tipologia ?? '—') },
                { id: 'area', label: 'Área (m²)', alinhamento: 'direita', valor: (l: any) => fmtArea(l.area_efetiva ?? l.area) },
              ]}
              .linhas=${this.unidadesDoLote}
              @urbi:tabela-click=${(e: CustomEvent) => this._navegar(`/unidade/${e.detail.linha.id}`)}
            ></urbi-tabela>`
        : nothing}
      ${u.area == null && u.area_matricula != null
        ? html`<p class="prop-meta">Área herdada da matrícula — o lote não tem área própria registrada.</p>`
        : nothing}
      ${this.vigente?.vigente
        ? html`<p class="prop-meta">Preço vigente herdado de: <strong>${NIVEL_LABEL[this.vigente.origem_cascata || ''] || '—'}</strong></p>`
        : nothing}
      <urbi-abas
        .abas=${[
          { id: 'propostas', label: 'Propostas Vigentes' },
          { id: 'transacoes', label: 'Transações', dot: 'aviso' },
          { id: 'acoes', label: 'Ações', ...(this._acoesEmDestaque.length > 0 ? { dot: 'aviso' } : {}) },
        ]}
        ativa=${this.abaDetalhe}
        @urbi:aba-selecionar=${(e: CustomEvent) => { this.abaDetalhe = e.detail.id; }}
      ></urbi-abas>
      ${this.abaDetalhe === 'transacoes'
        ? html`<urbi-estado-vazio icone="fa-solid fa-clock" mensagem="Transações em breve"
            submensagem="A entidade Transação ainda não existe no Núcleo. Ver issue #36."></urbi-estado-vazio>`
        : this.abaDetalhe === 'acoes'
          ? this._renderAcoes(u)
          : this._renderPropostasVigentes(this.rota.view, u.id)}
    `;
  }

  /**
   * Tela de Moradores.
   *
   * A coluna de imóveis fica vazia até o usuário escolher um parcelamento para
   * indexar — e isso é dito na tela, não escondido. O Núcleo não entrega
   * pessoa → imóveis, e preencher a coluna para as ~2.873 pessoas exigiria uma
   * requisição por lote da instância inteira.
   */
  private _renderMoradores(): TemplateResult {
    const indexado = this.parcelamentoIndexado !== null;
    const buscar = () => { this.moradoresPagina = 1; void this._carregarMoradores(1); };
    return html`
      <h2>Moradores</h2>
      <p class="prop-meta">
        ${this.moradoresTotal} pessoa(s) física(s) no Núcleo.
        A busca é do servidor, sobre nome e CPF — e, como ela é <code>ILIKE</code>,
        <strong>não cruza acento</strong>: procure <em>José</em>, não <em>jose</em>.
      </p>
      <urbi-input label="Nome ou CPF" .valor=${this.buscaMorador}
        @urbi:input-change=${(e: CustomEvent) => { this.buscaMorador = String(e.detail.valor ?? ''); }}
        @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') buscar(); }}></urbi-input>
      <div class="barra-acoes">
        <urbi-botao variante="primario" pequeno icone="fa-solid fa-magnifying-glass"
          ?carregando=${this.carregando} @click=${buscar}>Buscar</urbi-botao>
      </div>

      <urbi-banner variante=${indexado ? 'info' : 'alerta'}>
        ${indexado
          ? html`Imóveis preenchidos para <strong>${this._nomeParcelamento(this.parcelamentoIndexado)}</strong>.
              Pessoa vinculada só a outro parcelamento continua sem imóvel nesta coluna — o índice
              cobre um recorte, e ausência aqui <strong>não</strong> quer dizer ausência de vínculo.
              ${this.lotesQueFalharam > 0
                ? html`<br><strong>${this.lotesQueFalharam} lote(s) não responderam</strong>, então o
                    recorte está incompleto: quem só se vincula a eles não aparece. Escolha o
                    parcelamento de novo para tentar outra vez.`
                : nothing}`
          : html`<strong>A coluna de imóveis está vazia de propósito.</strong>
              O Núcleo entrega o vínculo morador↔imóvel só pelo lado do imóvel — não há rota de
              pessoa → imóveis. Montar o reverso custa <strong>uma requisição por lote</strong>, o que
              é viável para um parcelamento (~100) e não para a instância (~6.200).
              Escolha um parcelamento abaixo para preencher a coluna dele.`}
      </urbi-banner>

      <urbi-select label="Indexar os moradores de um parcelamento"
        .opcoes=${[{ valor: '', rotulo: '— nenhum —' },
          ...this.parcelamentos.map((p: any) => ({ valor: String(p.id), rotulo: nomeDe(p) }))]}
        .valor=${this.parcelamentoIndexado === null ? '' : String(this.parcelamentoIndexado)}
        @urbi:select-change=${(e: CustomEvent) => {
          const v = String(e.detail.valor ?? '');
          void this._indexarParcelamento(v ? Number(v) : null);
        }}></urbi-select>
      ${this.indexando ? html`<p class="prop-meta">Lendo os ocupantes lote a lote…</p>` : nothing}

      <urbi-wrap>
        <urbi-chips-atalho
          .opcoes=${[
            { id: 'todos', rotulo: 'Todos' },
            { id: 'incompletos', rotulo: 'Só cadastros incompletos' },
          ]}
          ativo=${this.soIncompletos ? 'incompletos' : 'todos'}
          @urbi:chip-atalho:click=${(e: CustomEvent) => { this.soIncompletos = e.detail.id === 'incompletos'; }}
        ></urbi-chips-atalho>
      </urbi-wrap>
      ${this.soIncompletos
        ? html`<p class="prop-meta">
            ${this._moradoresVisiveis.length} de ${this.moradores.length} nesta página têm falta
            <strong>comprovada</strong>. Quem está com situação indeterminada fica de fora: pode
            estar certo, e mandar conferir o que talvez não esteja quebrado torna a lista inútil.
          </p>`
        : nothing}

      <urbi-tabela
        clicavel
        ?carregando=${this.carregando && this.moradores.length === 0}
        mensagemVazio=${this.soIncompletos
          ? 'Nenhum cadastro com falta comprovada nesta página'
          : this.buscaMorador ? 'Nenhum morador com esse termo' : 'Nenhum morador'}
        .colunas=${[
          { id: 'nome', label: 'Nome', valor: (p: any) => String(p.pf_nome ?? p.nome ?? nomeDe(p)) },
          { id: 'cpf', label: 'CPF', valor: (p: any) => String(p.cpf_formatado ?? p.pf_cpf ?? p.cpf ?? '—') },
          { id: 'telefone', label: 'Telefone', render: (p: any) => this._renderTelefones(p) },
          { id: 'email', label: 'Email', render: (p: any) => this._renderEmails(p) },
          { id: 'imoveis', label: 'Imóveis', render: (p: any) => this._renderImoveisDaPessoa(p) },
          { id: 'situacao', label: 'Situação', render: (p: any) => this._renderSituacao(p) },
        ]}
        .linhas=${this._moradoresVisiveis}
        @urbi:tabela-click=${(e: CustomEvent) => this._navegar(`/morador/${e.detail.linha.id}`)}
      ></urbi-tabela>
      ${this.moradoresPaginas > 1
        ? html`<div class="barra-acoes">
            <urbi-botao variante="fantasma" pequeno ?desabilitado=${this.moradoresPagina <= 1}
              @click=${() => this._carregarMoradores(this.moradoresPagina - 1)}>Anterior</urbi-botao>
            <span class="prop-meta">Página ${this.moradoresPagina} de ${this.moradoresPaginas}</span>
            <urbi-botao variante="fantasma" pequeno ?desabilitado=${this.moradoresPagina >= this.moradoresPaginas}
              @click=${() => this._carregarMoradores(this.moradoresPagina + 1)}>Próxima</urbi-botao>
          </div>`
        : nothing}
    `;
  }

  /**
   * Moradores visíveis. O filtro de incompletos roda no CLIENTE, sobre a página
   * já carregada — o Núcleo não tem como filtrar por uma regra que é da app, e
   * ela depende de contatos que vêm por sub-recurso.
   *
   * Por isso ele filtra `incompleto`, e **não** `indeterminado`: só entra quem
   * tem falta comprovada. Varrer os indeterminados para dentro faria a lista
   * de "conserte estes" incluir cadastros que talvez estejam certos.
   */
  private get _moradoresVisiveis(): any[] {
    if (!this.soIncompletos) return this.moradores;
    return this.moradores.filter((p) => this._situacaoDe(p).estado === 'incompleto');
  }

  private _nomeParcelamento(id: number | null): string {
    const p = this.parcelamentos.find((x: any) => Number(x.id) === Number(id));
    return p ? nomeDe(p) : `#${id}`;
  }

  /**
   * Telefone e email em colunas separadas, como no legado — é assim que se vê
   * de relance QUAL contato falta. `…` enquanto o sub-recurso não voltou: não
   * é `—`, porque ainda não se sabe.
   */
  private _renderTelefones(p: any): TemplateResult {
    const c = this.contatosPorPessoa.get(Number(p?.id));
    if (!c) return html`<span class="prop-meta">…</span>`;
    const lista = (c.telefones || []).map((t: any) => String(t.telefone_formatado ?? t.telefone));
    return lista.length === 0 ? html`<span class="prop-meta">—</span>` : html`${lista.join(' · ')}`;
  }

  private _renderEmails(p: any): TemplateResult {
    const c = this.contatosPorPessoa.get(Number(p?.id));
    if (!c) return html`<span class="prop-meta">…</span>`;
    const lista = (c.emails || []).map((e: any) => String(e.email));
    return lista.length === 0 ? html`<span class="prop-meta">—</span>` : html`${lista.join(' · ')}`;
  }

  private _renderContatos(p: any): TemplateResult {
    const c = this.contatosPorPessoa.get(Number(p?.id));
    if (!c) return html`<span class="prop-meta">…</span>`;
    const partes = [
      ...(c.telefones || []).map((t: any) => String(t.telefone_formatado ?? t.telefone)),
      ...(c.emails || []).map((e: any) => String(e.email)),
    ];
    return partes.length === 0 ? html`—` : html`${partes.join(' · ')}`;
  }

  private _renderImoveisDaPessoa(p: any): TemplateResult {
    if (this.parcelamentoIndexado === null) return html`<span class="prop-meta">—</span>`;
    const lista = this.imoveisPorPessoa.get(Number(p?.id)) || [];
    if (lista.length === 0) return html`<span class="prop-meta">nenhum neste parcelamento</span>`;
    return html`<urbi-wrap>${lista.map(({ imovel, vinculo }) => html`
      <urbi-badge cor="padrao">${nomeDe(imovel)}${vinculo?.tipo_vinculo
        ? ` · ${ROTULO_VINCULO[vinculo.tipo_vinculo] ?? vinculo.tipo_vinculo}` : ''}</urbi-badge>`)}
    </urbi-wrap>`;
  }

  private _renderSituacao(p: any): TemplateResult {
    const s = this._situacaoDe(p);
    const b = BADGE_SITUACAO[s.estado];
    const titulo = s.estado === 'incompleto'
      ? `Falta: ${s.faltando.join(', ')}`
      : s.motivoIndeterminado ?? 'Cadastro completo';
    return html`<urbi-badge cor=${b.cor} title=${titulo}>${b.rotulo}</urbi-badge>`;
  }

  /**
   * Detalhe do morador. Existe para dar destino ao clique da lista — chip ou
   * linha clicável sem destino é defeito, não adiantamento.
   */
  private _renderDetalheMorador(): TemplateResult {
    const p = this.detalhe;
    if (!p) return html`<urbi-loading></urbi-loading>`;
    const s = this._situacaoDe(p);
    const b = BADGE_SITUACAO[s.estado];
    return html`
      <urbi-botao variante="fantasma" icone="fa-solid fa-arrow-left" pequeno
        @click=${() => this._navegar('/moradores')}>Voltar</urbi-botao>
      <h2>${String(p.nome ?? nomeDe(p))}</h2>
      <urbi-wrap>
        <urbi-badge cor=${b.cor}>${b.rotulo}</urbi-badge>
        ${s.estado === 'incompleto'
          ? html`<span class="prop-meta">Falta: ${s.faltando.join(', ')}</span>`
          : s.motivoIndeterminado
            ? html`<span class="prop-meta">${s.motivoIndeterminado}</span>`
            : nothing}
      </urbi-wrap>
      <urbi-wrap>
        <urbi-kpi rotulo="CPF" .valor=${String(p.cpf_formatado ?? p.cpf ?? '—')} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Identificador" .valor=${String(p.id_legivel ?? `#${p.id}`)} formato="texto"></urbi-kpi>
      </urbi-wrap>
      <p class="secao-titulo">Contatos</p>
      <p class="prop-meta">${this._renderContatos(p)}</p>
      <p class="secao-titulo">Imóveis</p>
      <p class="prop-meta">
        ${this.parcelamentoIndexado === null
          ? html`O Núcleo não expõe pessoa → imóveis. Indexe um parcelamento na
              <a href=${urbiVerso.href('/moradores')} @click=${(e: Event) => { e.preventDefault(); this._navegar('/moradores'); }}>lista de moradores</a>
              para ver os imóveis desta pessoa naquele recorte.`
          : this._renderImoveisDaPessoa(p)}
      </p>
    `;
  }

  private _renderProposta(): TemplateResult {
    const p = this.detalhe as Proposta | null;
    if (!p) return html`<urbi-loading></urbi-loading>`;
    return html`
      <urbi-botao variante="fantasma" icone="fa-solid fa-arrow-left" pequeno @click=${() => this._navegar(`/${p.nivel === 'setor' ? 'setor' : p.nivel}/${p.ref_id}`)}>Voltar</urbi-botao>
      <h2>${p.titulo}</h2>
      <div class="prop-meta">
        ${NIVEL_LABEL[p.nivel]} · ${p.tipo_proposta} ·
        <urbi-badge cor=${p.status_aprovacao === 'aprovada' ? 'sucesso' : 'alerta'}>${p.status_aprovacao}</urbi-badge>
      </div>
      <urbi-wrap>
        <urbi-kpi rotulo="Preço/m²" .valor=${fmtMoeda(p.preco_m2)} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Vigência" .valor=${`${fmtData(p.data_proposta)} — ${fmtData(p.data_fim_vigencia)}`} formato="texto"></urbi-kpi>
      </urbi-wrap>
      ${p.descricao ? html`<p>${p.descricao}</p>` : nothing}
      <div class="barra-acoes">
        ${p.status_aprovacao === 'pendente' && this.podeAprovar
          ? html`<urbi-botao variante="sucesso" icone="fa-solid fa-stamp" @click=${() => this._aprovar(p)}>Aprovar</urbi-botao>` : nothing}
        ${this.podeCriar
          ? html`<urbi-botao variante="secundario" icone="fa-solid fa-copy" @click=${() => this._abrirCopiar(p)}>Copiar</urbi-botao>` : nothing}
      </div>
    `;
  }

  private _renderPropostasVigentes(nivel: string, refId: number): TemplateResult {
    const ref = hoje();
    const herdada = this.vigente?.vigente && this.vigente.origem_cascata !== nivel
      ? this.vigente
      : null;
    return html`
      ${this.podeCriar
        ? html`<div class="barra-acoes">
            <urbi-botao variante="primario" icone="fa-solid fa-plus" @click=${() => this._abrirCriar(nivel, refId)}>Criar Proposta</urbi-botao>
          </div>`
        : nothing}
      ${herdada
        ? html`<urbi-banner variante="info">
            Sem proposta própria vigente aqui. O preço em uso vem de
            <strong>${NIVEL_LABEL[herdada.origem_cascata || ''] || '—'}</strong>:
            ${fmtMoeda(herdada.vigente!.preco_m2)}/m².
          </urbi-banner>`
        : nothing}
      ${this.propostas.length === 0
        ? html`<urbi-estado-vazio icone="fa-solid fa-file-invoice-dollar" mensagem="Nenhuma proposta neste nível"></urbi-estado-vazio>`
        : html`<urbi-stack>
            ${this.propostas.map((p) => html`
              <div class="prop-card">
                <div class="prop-topo">
                  <span class="prop-titulo">${p.titulo}</span>
                  <urbi-wrap>
                    <urbi-badge cor=${p.status_aprovacao === 'aprovada' ? 'sucesso' : 'alerta'}>${p.status_aprovacao}</urbi-badge>
                    ${(() => { const v = BADGE_VIGENCIA[statusVigencia(p, ref)];
                      return html`<urbi-badge cor=${v.cor}>${v.rotulo}</urbi-badge>`; })()}
                  </urbi-wrap>
                </div>
                <div class="prop-meta">
                  ${p.tipo_proposta} · ${fmtMoeda(p.preco_m2)}/m² · ${fmtData(p.data_proposta)} a ${fmtData(p.data_fim_vigencia)}
                </div>
                <div class="prop-acoes">
                  <urbi-botao variante="fantasma" pequeno @click=${() => this._navegar(`/proposta/${p.id}`)}>Detalhes</urbi-botao>
                  ${p.status_aprovacao === 'pendente' && this.podeAprovar
                    ? html`<urbi-botao variante="sucesso" pequeno @click=${() => this._aprovar(p)}>Aprovar</urbi-botao>` : nothing}
                  ${this.podeCriar
                    ? html`<urbi-botao variante="secundario" pequeno @click=${() => this._abrirCopiar(p)}>Copiar</urbi-botao>` : nothing}
                </div>
              </div>
            `)}
          </urbi-stack>`}
    `;
  }

  /**
   * Os três preços do legado, mais o valor do imóvel.
   *
   * A ORIGEM do preço final é escrita, não deduzível: três números sem dizer
   * qual está valendo é exatamente o que faz alguém "corrigir uma fórmula por
   * engano" — o risco que o preço de contrato existe para evitar.
   */
  /**
   * VGV é POTENCIAL: Σ (preço aplicável × área) de todos os lotes, não soma de
   * contratos assinados. Confere com a tela do legado — Bianca tem VGV de
   * R$ 6,8 mi com 5,26% de adesão, então não pode ser realizado.
   */
  /**
   * VGV calculado sobre base ausente vale ZERO e parece uma resposta: "R$ 0,00,
   * 1.220 lotes sem preço" é indistinguível de um parcelamento realmente sem
   * preço nenhum. Enquanto propostas e preços não estiverem em memória, o
   * painel diz o que está acontecendo em vez de mostrar número.
   */
  private _renderVgv(a: Agregado): TemplateResult {
    if (a.quantidade === 0) return html`${nothing}`;
    if (!this.basesDoVgvCarregadas) {
      return html`
        <p class="prop-meta">
          ${this.carregandoVgv
            ? 'Calculando o VGV — carregando propostas e preços…'
            : 'VGV indisponível: as bases de propostas e preços não carregaram.'}
        </p>
      `;
    }
    return html`
      <urbi-wrap>
        <urbi-kpi rotulo="VGV potencial" .valor=${fmtMoeda(a.vgv)} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Área somada dos lotes (m²)" .valor=${fmtArea(a.areaTotal)} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Área privativa (m²)" .valor=${a.areaPrivativa === null ? '—' : fmtArea(a.areaPrivativa)} formato="texto"></urbi-kpi>
      </urbi-wrap>
      <p class="prop-meta">
        VGV ${this._rotuloCobertura(a)}.
        ${a.areasDeduplicadas > 0
          ? html` <strong>${a.areasDeduplicadas}</strong> lote(s) dividem matrícula-mãe com outro: a área
              do conjunto foi contada uma vez só, para não inflar o total.`
          : nothing}
        ${a.areaPrivativa === null
          ? html` Área privativa depende do catálogo de Uso (issue #22) e ainda não é separável.`
          : nothing}
      </p>
    `;
  }

  /**
   * Aba de Ações do imóvel.
   *
   * O título de cada card sai de `tituloAcao`, em `comum/acoes.ts` — a mesma
   * função do badge e de qualquer listagem futura. Montar o título aqui também
   * é como os dois divergem no dia em que um deles muda.
   */
  private _renderAcoes(u: any): TemplateResult {
    const lista = this._acoesFiltradas;
    return html`
      ${this.podeCriar
        ? html`<div class="barra-acoes">
            <urbi-botao variante="primario" pequeno icone="fa-solid fa-gavel"
              @click=${() => this._abrirFormAcao()}>Criar ação</urbi-botao>
          </div>`
        : nothing}
      <urbi-input label="Buscar por pessoa vinculada" .valor=${this.buscaAcaoPessoa}
        @urbi:input-change=${(e: CustomEvent) => { this.buscaAcaoPessoa = String(e.detail.valor ?? ''); }}></urbi-input>
      ${this.carregandoAcoes
        ? html`<urbi-loading></urbi-loading>`
        : lista.length === 0
          ? html`<urbi-estado-vazio icone="fa-solid fa-gavel"
              mensagem=${this.acoes.length === 0 ? 'Nenhuma ação neste imóvel' : 'Nenhuma ação com esse filtro'}
              submensagem=${this.acoes.length === 0
                ? 'Ação que existe só contra uma pessoa, sem imóvel, aparece na tela dela.'
                : ''}></urbi-estado-vazio>`
          : html`<urbi-stack>${lista.map((a) => this._renderCardAcao(a, u))}</urbi-stack>`}
    `;
  }

  private _renderCardAcao(a: Acao, u: any): TemplateResult {
    const b = badgeAcao(a);
    return html`
      <urbi-card>
        <urbi-wrap>
          <urbi-badge cor=${b.cor}>${b.rotulo}</urbi-badge>
          ${a.status !== 'ativa'
            ? html`<urbi-badge cor="padrao">${ROTULO_STATUS[a.status] ?? a.status}</urbi-badge>`
            : nothing}
        </urbi-wrap>
        <p class="secao-titulo">${tituloAcao(a, nomeDe(u))}</p>
        <urbi-wrap>
          <urbi-kpi rotulo="Data" .valor=${soData(a.data) ?? '—'} formato="texto"></urbi-kpi>
          <urbi-kpi rotulo="Nº Processo" .valor=${a.numero_processo || '—'} formato="texto"></urbi-kpi>
          <urbi-kpi rotulo="Valor" .valor=${a.valor === null || a.valor === undefined ? '—' : fmtMoeda(a.valor)} formato="texto"></urbi-kpi>
        </urbi-wrap>
        ${a.descricao ? html`<p class="prop-meta">${a.descricao}</p>` : nothing}
        ${(a.pessoas || []).length > 0
          ? html`<urbi-wrap>${(a.pessoas || []).map((v) => html`
              <urbi-badge cor="padrao">${this._nomeDaPessoa(v.pessoa_id)} · ${ROTULO_PAPEL[v.papel as PapelPessoa] ?? v.papel}</urbi-badge>`)}
            </urbi-wrap>`
          : nothing}
        ${(a.imoveis || []).length > 1
          ? html`<p class="prop-meta">Esta ação alcança ${(a.imoveis || []).length} imóveis.</p>`
          : nothing}
        ${this.podeCriar
          ? html`<div class="barra-acoes">
              <urbi-botao variante="secundario" pequeno icone="fa-solid fa-pen"
                @click=${() => this._abrirFormAcao(a)}>Editar</urbi-botao>
              <urbi-botao variante="perigo" pequeno icone="fa-solid fa-trash"
                @click=${() => this._acaoDeAcao(() => reg360Api.removerAcao(a.id), 'Ação removida')}>Remover</urbi-botao>
            </div>`
          : nothing}
      </urbi-card>
    `;
  }

  private _renderFormAcao(): TemplateResult {
    const f = this.formAcao!;
    const set = (nome: string, valor: unknown) => { this.formAcao = { ...f, [nome]: valor }; };
    const campo = (nome: string, label: string, tipo = 'text') => html`
      <urbi-input label=${label} tipo=${tipo} .valor=${f[nome] ?? ''}
        @urbi:input-change=${(e: CustomEvent) => set(nome, e.detail.valor)}></urbi-input>`;
    const alvo = nomeDe(this.detalhe);
    return html`
      <urbi-modal title=${f.editandoId ? 'Editar ação' : 'Registrar ação'}
        @urbi-modal:close=${() => { this.formAcao = null; }}>
        <p class="prop-meta">
          O título é montado do tipo e do polo:
          <strong>${tituloAcao(f, alvo)}</strong>
        </p>
        <div class="form-grid">
          <urbi-select label="Tipo"
            .opcoes=${TIPOS_ACAO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO[t as TipoAcao] }))}
            .valor=${f.tipo}
            @urbi:select-change=${(e: CustomEvent) => set('tipo', e.detail.valor)}></urbi-select>
          <urbi-select label="Polo"
            .opcoes=${POLOS.map((p) => ({ valor: p, rotulo: p === 'up_contra' ? `UP contra ${alvo}` : `${alvo} contra UP` }))}
            .valor=${f.polo}
            @urbi:select-change=${(e: CustomEvent) => set('polo', e.detail.valor)}></urbi-select>
          ${campo('data', 'Data', 'date')}
          ${campo('numero_processo', 'Nº do processo')}
          ${campo('valor', 'Valor (R$)', 'number')}
          <urbi-select label="Situação"
            .opcoes=${STATUS_ACAO.map((st) => ({ valor: st, rotulo: ROTULO_STATUS[st] }))}
            .valor=${f.status}
            @urbi:select-change=${(e: CustomEvent) => set('status', e.detail.valor)}></urbi-select>
          <urbi-input class="full" label="Descrição" .valor=${f.descricao ?? ''}
            @urbi:input-change=${(e: CustomEvent) => set('descricao', e.detail.valor)}></urbi-input>
        </div>
        ${f.editandoId
          ? nothing
          : html`<p class="prop-meta">
              Este imóvel já entra vinculado. Vincular pessoas e outros imóveis é feito
              depois de criar — o vínculo com pessoa depende da tela de Moradores (issue #33)
              para escolher quem.
            </p>`}
        <div class="barra-acoes" style="margin-top:16px">
          <urbi-botao variante="fantasma" @click=${() => { this.formAcao = null; }}>Cancelar</urbi-botao>
          <urbi-botao variante="primario" ?carregando=${this.carregando}
            @click=${() => this._salvarFormAcao()}>Salvar</urbi-botao>
        </div>
      </urbi-modal>
    `;
  }

  private _renderPainelPrecos(u: any): TemplateResult {
    const d = this.dadosDoImovel || {};
    const vigente = this.vigente?.vigente;
    const { valor: preco, origem } = this._precoDoImovel;
    const area = u.area_efetiva ?? u.area;
    const valor = valorDoImovel(preco, area);
    const ROTULO_ORIGEM: Record<string, string> = {
      estatico: 'contrato gravado',
      manual: 'preço manual',
      proposta: `proposta vigente${this.vigente?.origem_cascata ? ` (${NIVEL_LABEL[this.vigente.origem_cascata] ?? ''})` : ''}`,
    };
    const formas: Array<[FormaPagamento, string]> = [['a_vista', 'À vista'], ['6x', '6×'], ['12x', '12×']];
    const temDesconto = vigente && formas.some(([f]) => aplicarDescontos(preco, vigente, f, area) !== preco);

    return html`
      <urbi-wrap>
        <urbi-kpi rotulo="Valor do imóvel" .valor=${valor === null ? '—' : fmtMoeda(valor)} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Preço proposta vigente (R$/m²)"
          .valor=${vigente ? fmtMoeda(vigente.preco_m2) : '—'} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Preço de contrato (R$/m²)"
          .valor=${d.preco_estatico != null ? fmtMoeda(d.preco_estatico) : '—'} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Preço final (R$/m²)"
          .valor=${preco === null ? '—' : fmtMoeda(preco)} formato="texto"></urbi-kpi>
      </urbi-wrap>
      <p class="prop-meta">
        ${origem
          ? html`Preço final vem de <strong>${ROTULO_ORIGEM[origem]}</strong>.`
          : html`Sem preço definido: não há contrato, preço manual, nem proposta vigente na cascata.`}
        ${d.preco_estatico != null && d.preco_estatico_em
          ? html` Contrato gravado em ${fmtData(d.preco_estatico_em)}${d.preco_estatico_por_nome ? ` por ${d.preco_estatico_por_nome}` : ''}.`
          : nothing}
      </p>

      ${temDesconto
        ? html`<p class="prop-meta">Com os descontos da proposta:
            ${formas.map(([f, rot]) => {
              const p = aplicarDescontos(preco, vigente, f, area);
              return html`<span> · ${rot}: ${p === null ? '—' : fmtMoeda(p)}/m²</span>`;
            })}
          </p>`
        : nothing}

      ${this.podeCriar
        ? html`<div class="barra-acoes">
            ${d.preco_estatico == null
              ? html`<urbi-botao variante="secundario" pequeno icone="fa-solid fa-file-signature"
                  @click=${() => this._abrirPreco('estatico')}>Gravar preço de contrato</urbi-botao>`
              : this.podeCriar && urbiVerso.contexto?.()?.nivelApp === 'admin'
                ? html`<urbi-botao variante="perigo" pequeno icone="fa-solid fa-triangle-exclamation"
                    @click=${() => this._abrirPreco('corrigir')}>Corrigir preço de contrato</urbi-botao>`
                : nothing}
            <urbi-botao variante="fantasma" pequeno icone="fa-solid fa-pen"
              @click=${() => this._abrirPreco('manual')}>Definir preço manual</urbi-botao>
            ${d.preco_m2_manual != null
              ? html`<urbi-botao variante="fantasma" pequeno
                  @click=${() => this._acaoPreco(() => reg360Api.salvarPrecoManual(this.rota.view, Number(u.id), null), 'Preço manual removido')}>Limpar manual</urbi-botao>`
              : nothing}
          </div>`
        : nothing}
    `;
  }

  private _abrirPreco(campo: 'estatico' | 'manual' | 'corrigir') {
    const d = this.dadosDoImovel || {};
    const atual = campo === 'manual' ? d.preco_m2_manual : d.preco_estatico;
    this.formPreco = { campo, valor: atual != null && campo === 'corrigir' ? String(atual) : '' };
  }

  private _renderFormPreco(): TemplateResult {
    const f = this.formPreco!;
    const u = this.detalhe;
    const titulo = f.campo === 'manual'
      ? 'Definir preço manual'
      : f.campo === 'estatico' ? 'Gravar preço de contrato' : 'Corrigir preço de contrato';

    const salvar = () => {
      const bruto = f.valor.trim();
      // Vazio só é intenção legítima na correção (apagar) — nos outros dois,
      // salvar em branco não quer dizer nada.
      if (!bruto && f.campo !== 'corrigir') return urbiVerso.notificar?.('Informe um valor', 'erro');
      const n = bruto === '' ? null : Number(bruto.replace(',', '.'));
      if (n !== null && (!Number.isFinite(n) || n < 0)) return urbiVerso.notificar?.('Valor inválido', 'erro');
      const id = Number(u.id);
      const acao =
        f.campo === 'manual' ? () => reg360Api.salvarPrecoManual(this.rota.view, id, n)
        : f.campo === 'estatico' ? () => reg360Api.gravarPrecoEstatico(this.rota.view, id, n as number)
        : () => reg360Api.corrigirPrecoEstatico(this.rota.view, id, n);
      this.formPreco = null;
      void this._acaoPreco(acao, 'Preço atualizado');
    };

    return html`
      <urbi-modal title=${titulo} @urbi-modal:close=${() => { this.formPreco = null; }}>
        ${f.campo === 'estatico'
          ? html`<urbi-banner variante="alerta">
              O preço de contrato registra um valor <strong>firmado</strong>. Uma vez gravado, só o
              admin da app consegue alterá-lo — é o que impede que ele se perca numa mudança de fórmula.
            </urbi-banner>`
          : nothing}
        ${f.campo === 'corrigir'
          ? html`<urbi-banner variante="erro">
              Você vai <strong>substituir</strong> o registro de um contrato firmado
              (atual: ${fmtMoeda(this.dadosDoImovel?.preco_estatico)}/m²). Deixe em branco para apagá-lo.
            </urbi-banner>`
          : nothing}
        ${f.campo === 'manual'
          ? html`<p class="prop-meta">Sobrepõe a proposta vigente, mas <strong>não</strong> o preço de contrato.</p>`
          : nothing}
        <urbi-input label="Preço por m² (R$)" tipo="number" .valor=${f.valor}
          @urbi:input-change=${(e: CustomEvent) => { this.formPreco = { ...f, valor: String(e.detail.valor ?? '') }; }}></urbi-input>
        <div class="barra-acoes" style="margin-top:16px">
          <urbi-botao variante="fantasma" @click=${() => { this.formPreco = null; }}>Cancelar</urbi-botao>
          <urbi-botao variante=${f.campo === 'corrigir' ? 'perigo' : 'primario'}
            ?carregando=${this.carregando} @click=${salvar}>Salvar</urbi-botao>
        </div>
      </urbi-modal>
    `;
  }

  private _renderFormRegularizacao(): TemplateResult {
    const f = this.formReg;
    const campo = (nome: string, label: string, tipo = 'text') => html`
      <urbi-input label=${label} tipo=${tipo} .valor=${f[nome] ?? ''}
        @urbi:input-change=${(e: CustomEvent) => { this.formReg = { ...this.formReg, [nome]: e.detail.valor }; }}></urbi-input>`;
    const faseAtual = badgeFase(faseRegularizacao(this.formReg));
    return html`
      <urbi-modal title="Editar regularização" @urbi-modal:close=${() => { this.formRegAberto = false; }}>
        <p class="prop-meta">
          A fase é <strong>derivada das datas</strong>, não escolhida: preencher uma data move o
          parcelamento sozinho. Com esta edição, a fase fica
          <urbi-badge cor=${faseAtual.cor}>${faseAtual.rotulo}</urbi-badge>.
        </p>
        <div class="form-grid">
          ${campo('numero_decreto', 'Nº do Decreto')}
          ${campo('matricula_id', 'Matrícula-mãe (id)', 'number')}
          ${campo('data_envio_projeto', 'Envio do projeto → Em análise', 'date')}
          ${campo('data_aprovacao_conplan', 'Aprovação CONPLAN → Aprovado', 'date')}
          ${campo('data_decreto_gdf', 'Decreto GDF → Registrado', 'date')}
          <urbi-select label="Situação registral"
            .opcoes=${SITUACOES_REGISTRAIS.map((op) => ({ valor: op.id, rotulo: op.rotulo }))}
            .valor=${f.situacao_registral ?? 'nenhuma'}
            @urbi:select-change=${(e: CustomEvent) => { this.formReg = { ...this.formReg, situacao_registral: e.detail.valor }; }}></urbi-select>
          ${campo('area_poligonal', 'Área poligonal (m²)', 'number')}
          ${campo('area_viario', 'Área de viário (m²)', 'number')}
          ${campo('area_servidao', 'Área de servidão (m²)', 'number')}
          <urbi-input class="full" label="Observação" .valor=${f.observacao ?? ''}
            @urbi:input-change=${(e: CustomEvent) => { this.formReg = { ...this.formReg, observacao: e.detail.valor }; }}></urbi-input>
        </div>
        <div class="barra-acoes" style="margin-top:16px">
          <urbi-botao variante="fantasma" @click=${() => { this.formRegAberto = false; }}>Cancelar</urbi-botao>
          <urbi-botao variante="primario" ?carregando=${this.carregando} @click=${() => this._salvarRegularizacao()}>Salvar</urbi-botao>
        </div>
      </urbi-modal>
    `;
  }

  private _renderForm(): TemplateResult {
    const f = this.form;
    const inputNum = (nome: string, label: string) => html`
      <urbi-input label=${label} tipo="number" .valor=${f[nome] ?? ''}
        @urbi:input-change=${(e: CustomEvent) => this._campo(nome, e.detail.valor)}></urbi-input>`;
    return html`
      <urbi-modal
        title=${this.formModo === 'copiar' ? 'Copiar proposta' : 'Nova proposta'}
        @urbi-modal:close=${() => { this.formAberto = false; }}
      >
        <p class="prop-meta">${NIVEL_LABEL[this.formNivel]} · alvo #${this.formRefId}</p>
        <div class="form-grid">
          <urbi-input class="full" label="Título" obrigatorio .valor=${f.titulo ?? ''}
            @urbi:input-change=${(e: CustomEvent) => this._campo('titulo', e.detail.valor)}></urbi-input>
          <urbi-select class="full" label="Tipo" .opcoes=${TIPO_OPCOES} .valor=${f.tipo_proposta ?? 'tabela'}
            @urbi:select-change=${(e: CustomEvent) => this._campo('tipo_proposta', e.detail.valor)}></urbi-select>
          <urbi-input label="Início da vigência" tipo="date" obrigatorio .valor=${f.data_proposta ?? ''}
            @urbi:input-change=${(e: CustomEvent) => this._campo('data_proposta', e.detail.valor)}></urbi-input>
          <urbi-input label="Fim da vigência" tipo="date" obrigatorio .valor=${f.data_fim_vigencia ?? ''}
            @urbi:input-change=${(e: CustomEvent) => this._campo('data_fim_vigencia', e.detail.valor)}></urbi-input>
          ${inputNum('preco_m2', 'Preço R$/m²')}
          ${inputNum('preco_minimo_residencial', 'Piso residencial')}
          ${inputNum('preco_minimo_comercial_misto', 'Piso comercial/misto')}
          ${inputNum('desconto_a_vista', '% à vista')}
          ${inputNum('desconto_6x', '% 6x')}
          ${inputNum('desconto_12x', '% 12x')}
          ${inputNum('desconto_lote_grande', '% lote grande')}
          ${inputNum('lote_grande_m2', 'Lote grande (m²)')}
          <urbi-input class="full" label="Descrição" .valor=${f.descricao ?? ''}
            @urbi:input-change=${(e: CustomEvent) => this._campo('descricao', e.detail.valor)}></urbi-input>
        </div>
        <div class="barra-acoes" style="margin-top:16px">
          <urbi-botao variante="fantasma" @click=${() => { this.formAberto = false; }}>Cancelar</urbi-botao>
          <urbi-botao variante="primario" ?carregando=${this.carregando} @click=${() => this._salvarForm()}>Salvar</urbi-botao>
        </div>
      </urbi-modal>
    `;
  }
}
