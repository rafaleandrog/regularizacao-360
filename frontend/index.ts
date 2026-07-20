import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { urbiVerso } from './reg360-env.js';
import { reg360Api, type Proposta } from './reg360-api.js';
import { soData } from '../comum/cascata.js';

// urbi-shell-page não está no barrel de primitivos — os demais urbi-* são
// registrados globalmente pelo shell (ui/src/primitivos.ts).

// ---------------------------------------------------------------------------
// Helpers de formatação e mapeamento
// ---------------------------------------------------------------------------

const NIVEL_LABEL: Record<string, string> = {
  setor: 'Setor Habitacional',
  parcelamento: 'Parcelamento',
  unidade: 'Unidade',
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

function fmtData(v: unknown): string {
  const d = soData(v);
  if (!d) return '—';
  const [y, m, dia] = d.split('-');
  return `${dia}/${m}/${y}`;
}

function nomeDe(o: any): string {
  return o?.nome ?? o?.id_legivel ?? o?.slug ?? o?.identificador ?? `#${o?.id ?? '?'}`;
}

/** Mapeia o status de regularização (calculado pelo Núcleo) para um badge. */
function badgeRegularizacao(status: unknown): { cor: string; label: string } {
  const s = String(status ?? '').toLowerCase().replace(/\s+/g, '_');
  if (s.includes('registrad')) return { cor: 'sucesso', label: 'Registrado' };
  if (s.includes('aprovad')) return { cor: 'info', label: 'Aprovado' };
  if (s.includes('analise') || s.includes('análise')) return { cor: 'alerta', label: 'Em análise' };
  if (s.includes('irregular')) return { cor: 'perigo', label: 'Irregular' };
  return { cor: 'padrao', label: status ? String(status) : '—' };
}

interface Rota {
  view: 'home' | 'parcelamentos' | 'unidades' | 'setor' | 'parcelamento' | 'unidade' | 'proposta';
  id: number | null;
}

function parseRota(sub: string): Rota {
  const partes = (sub || '/').split('/').filter(Boolean);
  if (partes.length === 0) return { view: 'home', id: null };
  const [a, b] = partes;
  const id = b ? Number(b) : null;
  switch (a) {
    case 'parcelamentos': return { view: 'parcelamentos', id: null };
    case 'unidades': return { view: 'unidades', id: null };
    case 'setor': return { view: 'setor', id };
    case 'parcelamento': return { view: 'parcelamento', id };
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
    .cards-setor { cursor: pointer; }
    .card-sh {
      border: 1px solid var(--cor-borda, rgba(255,255,255,.08));
      border-radius: 10px;
      padding: 16px;
      background: var(--cor-superficie, rgba(255,255,255,.03));
      cursor: pointer;
      display: flex; flex-direction: column; gap: 8px;
    }
    .card-sh:hover { background: var(--cor-superficie-hover, rgba(255,255,255,.06)); }
    .card-sh h3 { margin: 0; color: var(--cor-primaria-solida, #2AA9E0); font-size: 1rem; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 12px 0; }
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
    this.carregando = true;
    try {
      switch (this.rota.view) {
        case 'home':
          this.setores = (await reg360Api.setores()).dados || [];
          break;
        case 'parcelamentos':
          this.parcelamentos = (await reg360Api.parcelamentos()).dados || [];
          break;
        case 'unidades':
          this.unidades = (await reg360Api.unidades()).dados || [];
          break;
        case 'setor':
          if (this.rota.id) {
            this.abaDetalhe = 'empreendimentos';
            this.detalhe = await reg360Api.setor(this.rota.id);
            this.parcelamentos = (await reg360Api.parcelamentos({ setor_habitacional_id: this.rota.id })).dados || [];
            await this._carregarPropostas('setor', this.rota.id);
          }
          break;
        case 'parcelamento':
          if (this.rota.id) {
            this.abaDetalhe = 'unidades';
            this.detalhe = await reg360Api.parcelamento(this.rota.id);
            this.unidades = (await reg360Api.unidades({ parcelamento_id: this.rota.id })).dados || [];
            await this._carregarPropostas('parcelamento', this.rota.id);
          }
          break;
        case 'unidade':
          if (this.rota.id) {
            this.abaDetalhe = 'propostas';
            this.detalhe = await reg360Api.unidade(this.rota.id);
            await this._carregarPropostas('unidade', this.rota.id);
            this.vigente = await reg360Api.resolverVigente({
              nivel: 'unidade',
              ref_id: this.rota.id,
              parcelamento_id: this.detalhe?.parcelamento_id,
              setor_id: this.detalhe?.setor_habitacional_id,
            });
          }
          break;
        case 'proposta':
          if (this.rota.id) this.detalhe = await reg360Api.buscarProposta(this.rota.id);
          break;
      }
    } catch (e: any) {
      this.erro = e?.message || 'Falha ao carregar dados';
    } finally {
      this.carregando = false;
    }
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
      : 'regularizacao';

    return html`
      <urbi-shell-page titulo="Regularização 360">
        <urbi-abas
          .abas=${[
            { id: 'regularizacao', label: 'Regularização', icone: 'fa-solid fa-city' },
            { id: 'parcelamentos', label: 'Parcelamentos', icone: 'fa-solid fa-map' },
            { id: 'unidades', label: 'Unidades', icone: 'fa-solid fa-house' },
          ]}
          ativa=${abaTopo}
          @urbi:aba-selecionar=${(e: CustomEvent) => {
            const id = e.detail.id;
            this._navegar(id === 'regularizacao' ? '/' : `/${id}`);
          }}
        ></urbi-abas>

        ${this.erro ? html`<p class="erro">${this.erro}</p>` : nothing}
        ${this._renderView()}
      </urbi-shell-page>
      ${this.formAberto ? this._renderForm() : nothing}
    `;
  }

  private _renderView(): TemplateResult {
    switch (this.rota.view) {
      case 'home': return this._renderHome();
      case 'parcelamentos': return this._renderListaParcelamentos();
      case 'unidades': return this._renderListaUnidades();
      case 'setor': return this._renderDetalheSetor();
      case 'parcelamento': return this._renderDetalheParcelamento();
      case 'unidade': return this._renderDetalheUnidade();
      case 'proposta': return this._renderProposta();
      default: return html`${nothing}`;
    }
  }

  private _renderHome(): TemplateResult {
    if (this.carregando && this.setores.length === 0) return html`<urbi-loading></urbi-loading>`;
    if (this.setores.length === 0) return html`<urbi-estado-vazio icone="fa-solid fa-city" mensagem="Nenhum setor habitacional"></urbi-estado-vazio>`;
    return html`
      <urbi-grid min="240px" gap="12px">
        ${this.setores.map((sh) => html`
          <div class="card-sh" @click=${() => this._navegar(`/setor/${sh.id}`)}>
            <h3>${nomeDe(sh)}</h3>
            <div class="prop-meta">${sh.slug ?? ''}</div>
          </div>
        `)}
      </urbi-grid>
    `;
  }

  private _renderListaParcelamentos(): TemplateResult {
    return html`
      <urbi-tabela
        clicavel
        ?carregando=${this.carregando}
        mensagemVazio="Nenhum parcelamento"
        .colunas=${[
          { id: 'nome', label: 'Nome', valor: (l: any) => nomeDe(l) },
          { id: 'setor', label: 'Setor', valor: (l: any) => String(l.setor_habitacional_id ?? '—') },
          { id: 'status', label: 'Status', render: (l: any) => {
              const b = badgeRegularizacao(l.status_regularizacao);
              return html`<urbi-badge cor=${b.cor}>${b.label}</urbi-badge>`;
            } },
        ]}
        .linhas=${this.parcelamentos}
        @urbi:tabela-click=${(e: CustomEvent) => this._navegar(`/parcelamento/${e.detail.linha.id}`)}
      ></urbi-tabela>
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
    return html`
      <urbi-botao variante="fantasma" icone="fa-solid fa-arrow-left" pequeno @click=${() => this._navegar('/')}>Voltar</urbi-botao>
      <h2>${nomeDe(sh)}</h2>
      <div class="kpis">
        <urbi-kpi rotulo="Parcelamentos" .valor=${this.parcelamentos.length} formato="numero"></urbi-kpi>
        <urbi-kpi rotulo="Propostas vigentes" .valor=${this.propostas.filter((p) => p.status_aprovacao === 'aprovada').length} formato="numero"></urbi-kpi>
      </div>
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
              { id: 'status', label: 'Status', render: (l: any) => { const b = badgeRegularizacao(l.status_regularizacao); return html`<urbi-badge cor=${b.cor}>${b.label}</urbi-badge>`; } },
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
    const b = badgeRegularizacao(p.status_regularizacao);
    return html`
      <urbi-botao variante="fantasma" icone="fa-solid fa-arrow-left" pequeno @click=${() => this._navegar('/parcelamentos')}>Voltar</urbi-botao>
      <h2>${nomeDe(p)} <urbi-badge cor=${b.cor}>${b.label}</urbi-badge></h2>
      <div class="kpis">
        <urbi-kpi rotulo="Unidades" .valor=${this.unidades.length} formato="numero"></urbi-kpi>
        <urbi-kpi rotulo="Área poligonal (m²)" .valor=${p.area_poligonal ?? '—'} formato="texto"></urbi-kpi>
      </div>
      <urbi-abas
        .abas=${[
          { id: 'unidades', label: 'Unidades' },
          { id: 'propostas', label: 'Propostas Vigentes' },
        ]}
        ativa=${this.abaDetalhe}
        @urbi:aba-selecionar=${(e: CustomEvent) => { this.abaDetalhe = e.detail.id; }}
      ></urbi-abas>
      ${this.abaDetalhe === 'unidades'
        ? html`<urbi-tabela clicavel
            .colunas=${[
              { id: 'ident', label: 'Identificação', valor: (l: any) => nomeDe(l) },
              { id: 'area', label: 'Área (m²)', alinhamento: 'direita', valor: (l: any) => String(l.area_efetiva ?? l.area ?? '—') },
            ]}
            .linhas=${this.unidades}
            @urbi:tabela-click=${(e: CustomEvent) => this._navegar(`/unidade/${e.detail.linha.id}`)}
          ></urbi-tabela>`
        : this._renderPropostasVigentes('parcelamento', p.id)}
    `;
  }

  private _renderDetalheUnidade(): TemplateResult {
    const u = this.detalhe;
    if (!u) return html`<urbi-loading></urbi-loading>`;
    return html`
      <urbi-botao variante="fantasma" icone="fa-solid fa-arrow-left" pequeno @click=${() => this._navegar('/unidades')}>Voltar</urbi-botao>
      <h2>${nomeDe(u)}</h2>
      <div class="kpis">
        <urbi-kpi rotulo="Área (m²)" .valor=${u.area_efetiva ?? u.area ?? '—'} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Proposta vigente (R$/m²)"
          .valor=${this.vigente?.vigente ? fmtMoeda(this.vigente.vigente.preco_m2) : '—'} formato="texto"></urbi-kpi>
      </div>
      ${this.vigente?.vigente
        ? html`<p class="prop-meta">Preço vigente herdado de: <strong>${NIVEL_LABEL[this.vigente.origem_cascata || ''] || '—'}</strong></p>`
        : nothing}
      <urbi-abas
        .abas=${[
          { id: 'propostas', label: 'Propostas Vigentes' },
          { id: 'transacoes', label: 'Transações', dot: 'aviso' },
        ]}
        ativa=${this.abaDetalhe}
        @urbi:aba-selecionar=${(e: CustomEvent) => { this.abaDetalhe = e.detail.id; }}
      ></urbi-abas>
      ${this.abaDetalhe === 'transacoes'
        ? html`<urbi-estado-vazio icone="fa-solid fa-clock" mensagem="Transações em breve"
            submensagem="Disponível quando a entidade Transação existir no Núcleo."></urbi-estado-vazio>`
        : this._renderPropostasVigentes('unidade', u.id)}
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
      <div class="kpis">
        <urbi-kpi rotulo="Preço/m²" .valor=${fmtMoeda(p.preco_m2)} formato="texto"></urbi-kpi>
        <urbi-kpi rotulo="Vigência" .valor=${`${fmtData(p.data_proposta)} — ${fmtData(p.data_fim_vigencia)}`} formato="texto"></urbi-kpi>
      </div>
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
    return html`
      ${this.podeCriar
        ? html`<div class="barra-acoes">
            <urbi-botao variante="primario" icone="fa-solid fa-plus" @click=${() => this._abrirCriar(nivel, refId)}>Criar Proposta</urbi-botao>
          </div>` : nothing}
      ${this.propostas.length === 0
        ? html`<urbi-estado-vazio icone="fa-solid fa-file-invoice-dollar" mensagem="Nenhuma proposta neste nível"></urbi-estado-vazio>`
        : html`<urbi-stack>
            ${this.propostas.map((p) => html`
              <div class="prop-card">
                <div class="prop-topo">
                  <span class="prop-titulo">${p.titulo}</span>
                  <urbi-badge cor=${p.status_aprovacao === 'aprovada' ? 'sucesso' : 'alerta'}>${p.status_aprovacao}</urbi-badge>
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
