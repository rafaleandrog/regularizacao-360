/**
 * Agregados de imóveis: contagem, área e VGV (reg360).
 *
 * Roda no CLIENTE, e não por escolha: `req.nucleo` não lê no backend, então
 * quem tem os lotes em mãos é o frontend (ver `docs/leitura-nucleo.md`).
 *
 * Puro: recebe as coleções já carregadas e devolve os números. Sem fetch.
 */

import { precoAplicavel, valorDoImovel } from './preco.js';
import { selecionarVigente } from './cascata.js';

export interface Agregado {
  quantidade: number;
  /** Soma de `area_efetiva`, sem contar duas vezes matrícula-mãe compartilhada. */
  areaTotal: number;
  /**
   * Área de uso privativo. `null` enquanto o catálogo de Uso (issue #22) não
   * existir — separar privativo de comum exige saber o uso de cada lote, e
   * chutar produziria um número que parece certo e não é.
   */
  areaPrivativa: number | null;
  /** Σ (preço aplicável × área). Potencial, não realizado. */
  vgv: number;
  /** Quantos imóveis ficaram FORA do VGV, e por quê. */
  semPreco: number;
  semArea: number;
  /** Quantos imóveis entraram no VGV — o denominador honesto. */
  comValor: number;
  /** Matrículas-mãe compartilhadas cuja área foi contada uma vez só. */
  areasDeduplicadas: number;
  /** Soma só das áreas PRÓPRIAS — a parcela de `areaTotal` que nunca deduplica. */
  areaPropria: number;
  /**
   * Área herdada, por matrícula-mãe. Existe para que somar agregados NÃO
   * reconte o que cada um já deduplicou: a mesma matrícula pode cobrir lotes
   * de dois parcelamentos do mesmo Setor, e um número escalar não carrega a
   * identidade necessária para perceber isso na soma.
   */
  areaPorMatricula: Map<number, number>;
}

/**
 * Agregado zerado. É FUNÇÃO, não constante: espalhar uma constante copiaria a
 * REFERÊNCIA do `Map`, e dois agregados "vazios" passariam a compartilhar a
 * mesma instância — um mutando o outro em silêncio.
 */
function vazio(): Agregado {
  return {
    quantidade: 0, areaTotal: 0, areaPrivativa: null, vgv: 0,
    semPreco: 0, semArea: 0, comValor: 0, areasDeduplicadas: 0,
    areaPropria: 0, areaPorMatricula: new Map(),
  };
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Chave de `imovel_dados`, que é composta por (imovel_id, imovel_tipo). */
export function chaveImovel(imovelId: unknown, imovelTipo = 'lote'): string {
  return `${imovelTipo}:${Number(imovelId)}`;
}

/**
 * Índice das propostas aprovadas e vigentes por `nivel:ref_id`, pronto para a
 * cascata. Uma passada só sobre a tabela inteira.
 */
export function indexarPropostas(propostas: any[], ref: string): Map<string, any> {
  const porAlvo = new Map<string, any[]>();
  for (const p of propostas || []) {
    const chave = `${p?.nivel}:${Number(p?.ref_id)}`;
    const lista = porAlvo.get(chave);
    if (lista) lista.push(p);
    else porAlvo.set(chave, [p]);
  }
  const vigentes = new Map<string, any>();
  for (const [chave, lista] of porAlvo) {
    const v = selecionarVigente(lista, ref);
    if (v) vigentes.set(chave, v);
  }
  return vigentes;
}

/**
 * Proposta vigente de um lote, subindo a cascata: Lote → Parcelamento → Setor.
 *
 * A unidade não entra aqui porque o agregado percorre LOTES — unidade só existe
 * sob incorporação e é agregada à parte quando houver.
 */
export function vigentePorCascata(
  vigentes: Map<string, any>,
  loteId: unknown,
  parcelamentoId: unknown,
  setorId: unknown,
): any | null {
  return vigentes.get(`lote:${Number(loteId)}`)
    ?? vigentes.get(`parcelamento:${Number(parcelamentoId)}`)
    ?? vigentes.get(`setor:${Number(setorId)}`)
    ?? null;
}

export interface OpcoesAgregar {
  /** `chaveImovel()` → registro de `imovel_dados`. */
  dadosPorImovel?: Map<string, any>;
  /** Índice de `indexarPropostas`. */
  vigentes?: Map<string, any>;
  /** Setor do parcelamento de cada lote, para o último elo da cascata. */
  setorPorParcelamento?: Map<number, number>;
}

/**
 * Agrega um conjunto de lotes.
 *
 * **Matrícula-mãe compartilhada:** `imoveis.matricula_id` não é unique — uma
 * matrícula pode cobrir vários imóveis. Quando o lote não tem área própria, o
 * Núcleo devolve a área DA MATRÍCULA em `area_efetiva`; somar isso para cada
 * lote irmão multiplica a área do conjunto. Aqui a área herdada de uma mesma
 * matrícula é contada UMA VEZ, e o quanto isso aconteceu vai no retorno.
 *
 * O VGV segue somando por imóvel, porque preço é por imóvel — a dedupe é só da
 * área.
 */
export function agregarImoveis(lotes: any[], opcoes: OpcoesAgregar = {}): Agregado {
  const lista = lotes || [];
  if (lista.length === 0) return vazio();

  const dados = opcoes.dadosPorImovel ?? new Map();
  const vigentes = opcoes.vigentes ?? new Map();
  const setorPor = opcoes.setorPorParcelamento ?? new Map();

  const areaPorMatricula = new Map<number, number>();
  let areaPropriaTotal = 0;
  let vgv = 0;
  let semPreco = 0;
  let semArea = 0;
  let comValor = 0;
  let areasDeduplicadas = 0;

  for (const l of lista) {
    const areaPropria = numero(l?.area);
    const areaEfetiva = numero(l?.area_efetiva ?? l?.area);
    const matriculaId = numero(l?.matricula_id);

    // Área herdada da matrícula: conta uma vez por matrícula. Guardar POR
    // matrícula, em vez de só somar, é o que deixa a soma de agregados
    // deduplicar também ENTRE parcelamentos.
    if (areaEfetiva !== null) {
      const herdada = areaPropria === null && matriculaId !== null;
      if (herdada) {
        if (areaPorMatricula.has(matriculaId)) areasDeduplicadas += 1;
        else areaPorMatricula.set(matriculaId, areaEfetiva);
      } else {
        areaPropriaTotal += areaEfetiva;
      }
    }

    const parcelamentoId = numero(l?.parcelamento_id);
    const proposta = vigentePorCascata(
      vigentes,
      l?.id,
      parcelamentoId,
      parcelamentoId !== null ? setorPor.get(parcelamentoId) : undefined,
    );
    const { valor: preco } = precoAplicavel(dados.get(chaveImovel(l?.id, 'lote')), proposta);

    if (preco === null) { semPreco += 1; continue; }
    if (areaEfetiva === null) { semArea += 1; continue; }

    const valor = valorDoImovel(preco, areaEfetiva);
    if (valor === null) { semArea += 1; continue; }
    vgv += valor;
    comValor += 1;
  }

  return {
    quantidade: lista.length,
    areaTotal: areaPropriaTotal + somaDoMapa(areaPorMatricula),
    areaPrivativa: null,
    vgv,
    semPreco,
    semArea,
    comValor,
    areasDeduplicadas,
    areaPropria: areaPropriaTotal,
    areaPorMatricula,
  };
}

function somaDoMapa(m: Map<number, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

/**
 * Soma agregados já calculados — o Setor soma os parcelamentos, sem revarrer.
 *
 * **A área não é soma simples.** Cada parte já deduplicou a matrícula-mãe
 * DENTRO dela; somar os totais recontaria a matrícula que cobre lotes de dois
 * parcelamentos do mesmo Setor, e o número inflado não teria como se denunciar.
 * Por isso a soma une os mapas de área herdada em vez de somar escalares, e a
 * repetição entre partes entra em `areasDeduplicadas` como qualquer outra.
 */
export function somarAgregados(partes: Agregado[]): Agregado {
  const acc = vazio();
  for (const a of partes || []) {
    acc.quantidade += a.quantidade;
    acc.vgv += a.vgv;
    acc.semPreco += a.semPreco;
    acc.semArea += a.semArea;
    acc.comValor += a.comValor;
    acc.areasDeduplicadas += a.areasDeduplicadas;
    acc.areaPropria += a.areaPropria;
    for (const [matriculaId, area] of a.areaPorMatricula) {
      if (acc.areaPorMatricula.has(matriculaId)) acc.areasDeduplicadas += 1;
      else acc.areaPorMatricula.set(matriculaId, area);
    }
  }
  acc.areaTotal = acc.areaPropria + somaDoMapa(acc.areaPorMatricula);
  return acc;
}
