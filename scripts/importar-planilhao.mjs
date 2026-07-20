#!/usr/bin/env node
/**
 * Importação determinística do Planilhão → Núcleo (spec §7).
 *
 * Ferramenta de operação (NÃO faz parte do runtime do app). Lê o Planilhão
 * exportado para CSV (UTF-8) e faz upsert idempotente das entidades
 * territoriais e de pessoas no Núcleo, através do proxy de Núcleo do reg360
 * (`/api/reg360/nucleo/*`), autenticando por token de API.
 *
 * Escopo (MVP): estrutura territorial + pessoas. Transação fica de fora até a
 * entidade existir no Núcleo (spec §3.1 / §7).
 *
 * Pré-requisitos:
 *   - Os Setores Habitacionais já devem existir no Núcleo (reg360 é read-only
 *     em setores). São 5 na Fazenda Paranoazinho — crie-os pelo editor_nucleo.
 *   - As flags de Núcleo do reg360 (escrever em parcelamentos/matriculas/
 *     imoveis/pessoas) devem estar habilitadas em Admin → Apps → reg360 → Núcleo.
 *   - Um token de API de um usuário com nível `escrita`+ no reg360.
 *
 * Uso:
 *   URBI_BASE=https://urbiverso.com.br URBI_TOKEN=xxxx \
 *     node importar-planilhao.mjs caminho/planilhao.csv [--executar]
 *
 * Sem `--executar` o script roda em DRY-RUN (não escreve nada; só relata).
 *
 * ⚠️ Este script NÃO foi executado contra dados reais nem contra um Núcleo
 * rodando. Antes do import de verdade: confira COLUNAS (cabeçalhos reais do
 * Planilhão) e ENDPOINTS/campos (contra o Núcleo da instância) num dry-run.
 */

// ---------------------------------------------------------------------------
// Configuração — AJUSTE conforme o Planilhão e o Núcleo da instância
// ---------------------------------------------------------------------------

/** Cabeçalhos esperados no CSV do Planilhão (mapeamento spec §7). */
const COLUNAS = {
  setor_nome: 'Setor',            // Setor Habitacional (rótulo)
  parcelamento_nome: 'PAR',       // Parcelamento / Empreendimento / Condomínio
  quadra: 'QD',
  conjunto: 'CJ',
  lote: 'LT',
  rua: 'Endereço',
  area: 'Área',
  matricula: 'Matrícula',
  uso: 'Uso',
  morador_nome: 'Morador',
  cpf: 'CPF/CNPJ',
};

/** Caminhos dos recursos no proxy de Núcleo do reg360 (hífen). */
const ENDPOINTS = {
  setores: '/nucleo/setores-habitacionais',
  parcelamentos: '/nucleo/parcelamentos',
  lotes: '/nucleo/lotes',
  matriculas: '/nucleo/matriculas',
  pessoas_fisicas: '/nucleo/pessoas-fisicas',
};

const BASE = process.env.URBI_BASE || 'http://localhost:3000';
const TOKEN = process.env.URBI_TOKEN || '';
const APP = 'reg360';
const EXECUTAR = process.argv.includes('--executar');

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** slug canônico: minúsculas, [a-z0-9_], começando por letra. */
function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 's$1');
}

function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

function normalizarArea(s) {
  const n = Number(String(s || '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Parser CSV mínimo (RFC4180-ish): aspas, vírgulas e quebras dentro de campo. */
function parseCsv(texto) {
  const linhas = [];
  let campo = '', linha = [], dentroAspas = false;
  const push = () => { linha.push(campo); campo = ''; };
  const fim = () => { push(); linhas.push(linha); linha = []; };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i], prox = texto[i + 1];
    if (dentroAspas) {
      if (c === '"' && prox === '"') { campo += '"'; i++; }
      else if (c === '"') dentroAspas = false;
      else campo += c;
    } else {
      if (c === '"') dentroAspas = true;
      else if (c === ',') push();
      else if (c === '\r') { /* ignora */ }
      else if (c === '\n') fim();
      else campo += c;
    }
  }
  if (campo.length > 0 || linha.length > 0) fim();
  const cabecalho = linhas.shift() || [];
  return linhas
    .filter((l) => l.some((v) => v !== ''))
    .map((l) => Object.fromEntries(cabecalho.map((h, i) => [h.trim(), (l[i] ?? '').trim()])));
}

// ---------------------------------------------------------------------------
// Cliente HTTP (proxy de Núcleo do reg360)
// ---------------------------------------------------------------------------

async function req(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}/api/${APP}${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {}),
    },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`${opcoes.method || 'GET'} ${caminho} → ${r.status} ${txt}`);
  }
  return r.status === 204 ? null : r.json();
}

async function buscarPrimeiro(endpoint, filtros) {
  const qs = new URLSearchParams(filtros).toString();
  const resp = await req(`${endpoint}?${qs}`);
  return resp?.dados?.[0] ?? null;
}

/** Upsert: retorna o registro existente (por filtros-chave) ou cria um novo. */
async function upsert(rotulo, endpoint, filtrosChave, corpo, cache) {
  const chave = `${endpoint}|${JSON.stringify(filtrosChave)}`;
  if (cache.has(chave)) return cache.get(chave);
  let reg = await buscarPrimeiro(endpoint, filtrosChave);
  if (!reg) {
    if (EXECUTAR) {
      reg = await req(endpoint, { method: 'POST', body: JSON.stringify(corpo) });
      contadores[rotulo] = (contadores[rotulo] || 0) + 1;
    } else {
      reg = { id: `(dry:${chave})`, ...corpo };
      contadores[`${rotulo} (dry)`] = (contadores[`${rotulo} (dry)`] || 0) + 1;
    }
  }
  cache.set(chave, reg);
  return reg;
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

const contadores = {};
const erros = [];

async function importar(linhas) {
  const cache = new Map();

  for (const [i, row] of linhas.entries()) {
    try {
      // 1. Setor (read-only — deve pré-existir; resolvido por slug)
      const setorSlug = slugify(row[COLUNAS.setor_nome]);
      if (!setorSlug) throw new Error('Setor vazio');
      const setor = await buscarPrimeiro(ENDPOINTS.setores, { slug: setorSlug });
      if (!setor) throw new Error(`Setor '${setorSlug}' não existe no Núcleo (crie via editor_nucleo)`);

      // 2. Parcelamento (upsert por slug, FK setor)
      const parcSlug = slugify(row[COLUNAS.parcelamento_nome]);
      const parc = await upsert('parcelamento', ENDPOINTS.parcelamentos, { slug: parcSlug }, {
        slug: parcSlug,
        nome: row[COLUNAS.parcelamento_nome],
        setor_habitacional_id: setor.id,
      }, cache);

      // 3. Matrícula (upsert por número, se houver)
      let matriculaId = null;
      const matNum = soDigitos(row[COLUNAS.matricula]);
      if (matNum) {
        const mat = await upsert('matricula', ENDPOINTS.matriculas, { numero: matNum }, { numero: matNum }, cache);
        matriculaId = mat.id;
      }

      // 4. Lote (upsert por parcelamento+quadra+conjunto+numero_lote)
      const filtroLote = {
        parcelamento_id: parc.id,
        quadra: row[COLUNAS.quadra] || '',
        conjunto: row[COLUNAS.conjunto] || '',
        numero_lote: row[COLUNAS.lote] || '',
      };
      await upsert('lote', ENDPOINTS.lotes, filtroLote, {
        ...filtroLote,
        rua: row[COLUNAS.rua] || null,
        area: normalizarArea(row[COLUNAS.area]),
        ...(matriculaId ? { matricula_id: matriculaId } : {}),
      }, cache);
      // Obs.: cada lote gera 1 unidade default no Núcleo (não criamos unidade aqui).

      // 5. Pessoa Física (upsert por CPF)
      const cpf = soDigitos(row[COLUNAS.cpf]);
      if (cpf && cpf.length === 11 && row[COLUNAS.morador_nome]) {
        await upsert('pessoa_fisica', ENDPOINTS.pessoas_fisicas, { cpf }, {
          nome: row[COLUNAS.morador_nome],
          cpf,
        }, cache);
        // TODO (quando houver endpoint): vincular ocupação morador↔lote (imovel_pessoas).
      }
    } catch (e) {
      erros.push(`Linha ${i + 2}: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const caminho = process.argv.find((a) => a.endsWith('.csv'));
  if (!caminho) {
    console.error('Uso: URBI_BASE=... URBI_TOKEN=... node importar-planilhao.mjs planilhao.csv [--executar]');
    process.exit(1);
  }
  if (EXECUTAR && !TOKEN) {
    console.error('URBI_TOKEN é obrigatório para --executar');
    process.exit(1);
  }
  const fs = await import('node:fs/promises');
  const texto = await fs.readFile(caminho, 'utf-8');
  const linhas = parseCsv(texto);

  console.log(`Modo: ${EXECUTAR ? 'EXECUTAR (escreve no Núcleo)' : 'DRY-RUN (nada é escrito)'}`);
  console.log(`Linhas lidas: ${linhas.length}`);

  await importar(linhas);

  console.log('\n== Resumo ==');
  for (const [k, v] of Object.entries(contadores)) console.log(`  ${k}: ${v}`);
  if (erros.length) {
    console.log(`\n== ${erros.length} erro(s) ==`);
    for (const e of erros.slice(0, 50)) console.log(`  ${e}`);
    if (erros.length > 50) console.log(`  … +${erros.length - 50}`);
  }
  process.exit(erros.length ? 2 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
