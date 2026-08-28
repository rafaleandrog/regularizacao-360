#!/usr/bin/env node
/**
 * Importação do Planilhão → Núcleo + tabelas do reg360.
 *
 * Ferramenta de operação (NÃO faz parte do runtime do app). Lê o Planilhão em
 * CSV e faz upsert idempotente, pelo proxy de Núcleo do reg360
 * (`/api/reg360/nucleo/*`) e pelas rotas próprias do app.
 *
 * **Isto não é carga inicial em base vazia.** A instância já tem 60
 * parcelamentos, ~6.233 lotes, ~2.873 pessoas e ~4.808 matrículas: é importação
 * incremental sobre dado vivo, que é o caso difícil. Daí o dry-run ser o padrão
 * e a escrita exigir `--executar`.
 *
 * Uso:
 *   URBI_BASE=https://homolog.urbiverso.com.br URBI_TOKEN=xxxx \
 *     node scripts/importar-planilhao.mjs planilhao.csv [--executar]
 *
 * `--simular` é sinônimo de omitir `--executar`, aceito porque é como a issue
 * #38 nomeia o modo. O padrão continua sendo não escrever: com 6 mil linhas
 * sobre base viva, o modo seguro é o que se obtém por engano.
 */

// ---------------------------------------------------------------------------
// Configuração — AJUSTE conforme o Planilhão
// ---------------------------------------------------------------------------

/** Cabeçalhos esperados no CSV do Planilhão. */
export const COLUNAS = {
  setor_nome: 'Setor',
  parcelamento_nome: 'PAR',
  quadra: 'QD',
  conjunto: 'CJ',
  lote: 'LT',
  rua: 'Endereço',
  area: 'Área',
  matricula: 'Matrícula',
  uso: 'Uso',
  tipo_lote: 'Tipo Lote',
  morador_nome: 'Morador',
  cpf: 'CPF/CNPJ',
  preco: 'Preço',
  numero_decreto: 'Nº Decreto',
  status_transacao: 'Status',
};

/**
 * Caminhos no proxy de Núcleo do reg360.
 *
 * **`pessoas/fisicas` leva BARRA, não hífen.** O resto dos recursos usa hífen
 * (`setores-habitacionais`), e a versão anterior deste script generalizou isso
 * para pessoas — todo upsert de morador tomava 404. No Núcleo o caminho é
 * `/pessoas/fisicas` justamente para o Express não resolver como `/pessoas/:id`
 * com `id='fisicas'`. É o tipo de detalhe que falha calado: 404 numa linha de
 * importação em lote parece dado ruim, não rota errada.
 */
export const ENDPOINTS = {
  setores: '/nucleo/setores-habitacionais',
  parcelamentos: '/nucleo/parcelamentos',
  lotes: '/nucleo/lotes',
  matriculas: '/nucleo/matriculas',
  pessoas_fisicas: '/nucleo/pessoas/fisicas',
};

const BASE = process.env.URBI_BASE || 'http://localhost:3000';
const TOKEN = process.env.URBI_TOKEN || '';
const APP = 'reg360';
/**
 * `--simular` VENCE `--executar`.
 *
 * A issue #38 nomeia o modo seguro de `--simular`, e este script já o tem como
 * padrão. Mas aceitar a flag sem lhe dar efeito seria pior que não aceitá-la:
 * quem escreve `--executar --simular` está pedindo para não gravar, e um script
 * que ignorasse o segundo argumento escreveria 6 mil linhas na base viva.
 *
 * Em conflito, o modo seguro ganha — sempre.
 */
const SIMULAR = process.argv.includes('--simular');
const EXECUTAR = process.argv.includes('--executar') && !SIMULAR;

// ---------------------------------------------------------------------------
// Utilidades puras (exportadas para teste)
// ---------------------------------------------------------------------------

/** slug canônico: minúsculas, [a-z0-9_], começando por letra. */
export function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 's$1');
}

export function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

/**
 * Lê um número do Planilhão, distinguindo separador decimal de milhar.
 *
 * **Apagar todo ponto é o erro óbvio e caro.** `'161.10'` viraria `16110` — e o
 * preço é gravação única: um valor inflado assim exigiria a rota de correção,
 * que é só do admin. O ponto é milhar em `1.234,56` e decimal em `161.10`, e o
 * texto sozinho nem sempre diz qual.
 *
 * As regras, da mais segura para a menos:
 *
 * - tem vírgula → ela é o decimal, e todo ponto é milhar (formato pt-BR);
 * - só pontos, mais de um → todos milhar (`1.234.567`);
 * - um ponto com 1 ou 2 dígitos depois → decimal (`161.10`, `161.1`);
 * - um ponto com exatamente 3 dígitos depois → **AMBÍGUO**. `1.234` é 1234 em
 *   pt-BR e 1,234 em inglês, e não há como saber pelo texto.
 *
 * O ambíguo não é chutado: devolve `{ ambiguo }`, e quem chama reporta em vez
 * de gravar. Chutar aqui grava número errado em campo que não se desfaz.
 */
export function lerNumeroBR(s) {
  const bruto = String(s ?? '').replace(/[R$\s]/g, '').trim();
  if (!bruto) return { valor: null };
  if (!/^-?[\d.,]+$/.test(bruto)) return { valor: null };

  const temVirgula = bruto.includes(',');
  const pontos = (bruto.match(/\./g) || []).length;

  let normalizado;
  if (temVirgula) {
    normalizado = bruto.replace(/\./g, '').replace(',', '.');
  } else if (pontos === 0) {
    normalizado = bruto;
  } else if (pontos > 1) {
    normalizado = bruto.replace(/\./g, '');
  } else {
    const depois = bruto.split('.')[1] ?? '';
    if (depois.length === 3) return { ambiguo: bruto };
    normalizado = bruto;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? { valor: n } : { valor: null };
}

/**
 * Área do Planilhão. Vazio é `null`, **não zero**.
 *
 * `Number('')` é `0`, e a versão anterior deixava isso passar — lote sem área
 * registrada entrava com `area: 0`. Não é detalhe: no Núcleo, `area` nula é o
 * sinal de que a área vem da MATRÍCULA, e é dele que o agregado tira a dedupe
 * de matrícula-mãe compartilhada. Com `area: 0`, o lote passa a ter "área
 * própria", a dedupe não acontece, e a área da matrícula é somada uma vez por
 * lote irmão — inflando o total do parcelamento.
 *
 * Ou seja: um zero importado aqui reintroduz, pelo dado, o defeito que o
 * agregado conserta no código.
 *
 * Área ambígua vira `null` (não importada) em vez de um número chutado — a
 * área errada é o que mais mente no VGV.
 */
export function normalizarArea(s) {
  const r = lerNumeroBR(s);
  if (r.ambiguo || r.valor === null || r.valor < 0) return null;
  return r.valor;
}

/**
 * Preço do Planilhão. `null` quando vazio; `{ ambiguo }` quando o separador não
 * dá para decidir — e aí a linha vai ao relatório em vez de gravar.
 */
export function normalizarPreco(s) {
  const r = lerNumeroBR(s);
  if (r.ambiguo) return r;
  if (r.valor === null || r.valor < 0) return { valor: null };
  return r;
}

/**
 * O registro devolvido pelo Núcleo casa mesmo com a chave que pedimos?
 *
 * **Esta é a guarda mais importante do script.** O Núcleo ignora em SILÊNCIO
 * filtro fora da allowlist — não rejeita. Então `GET /lotes?quadra=B&lote=1`
 * pode devolver a instância inteira, e `dados[0]` seria um lote qualquer, que o
 * upsert trataria como "já existe".
 *
 * O efeito seria catastrófico e mudo: milhares de lotes não criados, matrícula
 * pendurada no imóvel errado, e um relatório dizendo "0 criados, tudo já
 * existia". Por isso não se confia no filtro: confere-se o que voltou.
 */
export function casaComChave(registro, chave) {
  if (!registro) return false;
  return Object.entries(chave).every(([campo, valor]) => {
    const doRegistro = registro[campo];
    if (valor === null || valor === undefined || valor === '') {
      return doRegistro === null || doRegistro === undefined || doRegistro === '';
    }
    return String(doRegistro ?? '') === String(valor);
  });
}

/** Parser CSV mínimo (RFC4180-ish): aspas, vírgulas e quebras dentro de campo. */
export function parseCsv(texto) {
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

/**
 * A linha traz status de transação do Planilhão?
 *
 * "Contratado", "CP" e "Vendido" mapeiam para tipos de Transação — entidade que
 * **não existe no Núcleo** (issue #36). Essas linhas vão para um relatório de
 * pendências em vez de sumir: descartar em silêncio faria o import parecer
 * completo e deixaria o dado comercial para trás sem ninguém saber.
 */
export function temTransacaoPendente(row, colunas = COLUNAS) {
  const v = String(row?.[colunas.status_transacao] ?? '').trim().toLowerCase();
  if (!v) return false;
  return ['contratado', 'cp', 'vendido', 'escriturado', 'cedido'].includes(v);
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

export function novoRelatorio() {
  return {
    criados: {},
    atualizados: {},
    ignorados: {},
    divergencias: [],
    transacoesPendentes: [],
    catalogoPendente: [],
    erros: [],
  };
}

const conta = (mapa, chave) => { mapa[chave] = (mapa[chave] || 0) + 1; };

// ---------------------------------------------------------------------------
// Cliente HTTP
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
  const corpo = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    const err = new Error(`${opcoes.method || 'GET'} ${caminho} → ${r.status} ${JSON.stringify(corpo)}`);
    err.status = r.status;
    err.corpo = corpo;
    throw err;
  }
  return corpo;
}

/**
 * Busca por chave, CONFERINDO o que voltou.
 *
 * Ver `casaComChave`: o filtro que o Núcleo ignora não avisa. Se o primeiro
 * registro não casa, tratamos como "não encontrado" — e se a lista veio grande
 * quando a chave deveria dar no máximo um, o filtro foi ignorado e o script
 * **para**, em vez de importar sobre premissa falsa.
 */
async function buscarPorChave(endpoint, chave) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(chave).filter(([, v]) => v !== '' && v != null)),
  ).toString();
  const resp = await req(`${endpoint}?${qs}`);
  const dados = resp?.dados ?? [];
  if (dados.length === 0) return null;

  const primeiro = dados[0];
  if (casaComChave(primeiro, chave)) return primeiro;

  // Não casou: ou o filtro foi ignorado, ou a allowlist não cobre estes campos.
  // Nos dois casos, continuar seria escrever às cegas.
  const err = new Error(
    `Filtro ignorado pelo Núcleo em ${endpoint}: pedi ${JSON.stringify(chave)} e voltou `
    + `${JSON.stringify(Object.fromEntries(Object.keys(chave).map((k) => [k, primeiro[k]])))}. `
    + 'O Núcleo descarta filtro fora da allowlist SEM erro — importar assim criaria duplicata '
    + 'ou penduraria dado no registro errado.',
  );
  err.fatal = true;
  throw err;
}

/** Upsert por chave natural, com o cache de sessão. */
async function upsert(rotulo, endpoint, chave, corpo, cache, rel) {
  const idCache = `${endpoint}|${JSON.stringify(chave)}`;
  if (cache.has(idCache)) return cache.get(idCache);

  const existente = await buscarPorChave(endpoint, chave);
  if (existente) {
    conta(rel.ignorados, `${rotulo} (já existia)`);
    cache.set(idCache, existente);
    return existente;
  }

  let reg;
  if (EXECUTAR) {
    reg = await req(endpoint, { method: 'POST', body: JSON.stringify(corpo) });
    conta(rel.criados, rotulo);
  } else {
    reg = { id: `(simulado:${idCache})`, ...corpo };
    conta(rel.criados, `${rotulo} (simulado)`);
  }
  cache.set(idCache, reg);
  return reg;
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

export async function importar(linhas, rel, colunas = COLUNAS) {
  const cache = new Map();

  for (const [i, row] of linhas.entries()) {
    const nLinha = i + 2;
    try {
      // 1. Setor — read-only para o app; tem que pré-existir.
      const setorSlug = slugify(row[colunas.setor_nome]);
      if (!setorSlug) throw new Error('Setor vazio');
      const setor = await buscarPorChave(ENDPOINTS.setores, { slug: setorSlug });
      if (!setor) throw new Error(`Setor '${setorSlug}' não existe no Núcleo (crie via editor_nucleo)`);

      // 2. Parcelamento
      const parcSlug = slugify(row[colunas.parcelamento_nome]);
      if (!parcSlug) throw new Error('Parcelamento vazio');
      const parc = await upsert('parcelamento', ENDPOINTS.parcelamentos, { slug: parcSlug }, {
        slug: parcSlug,
        nome: row[colunas.parcelamento_nome],
        setor_habitacional_id: setor.id,
      }, cache, rel);

      // 3. Matrícula
      let matriculaId = null;
      const matNum = soDigitos(row[colunas.matricula]);
      if (matNum) {
        const mat = await upsert('matricula', ENDPOINTS.matriculas, { numero: matNum }, { numero: matNum }, cache, rel);
        matriculaId = mat.id;
      }

      // 4. LOTE — não "unidade default".
      //
      // A premissa da spec v0.9 de que todo lote gera uma unidade nunca virou
      // realidade: no Núcleo, `unidades.incorporacao_id` é NOT NULL, então
      // unidade só existe sob incorporação. O objeto do Planilhão é o lote.
      const chaveLote = {
        parcelamento_id: parc.id,
        quadra: row[colunas.quadra] || '',
        conjunto: row[colunas.conjunto] || '',
        numero_lote: row[colunas.lote] || '',
      };
      const lote = await upsert('lote', ENDPOINTS.lotes, chaveLote, {
        ...chaveLote,
        rua: row[colunas.rua] || null,
        area: normalizarArea(row[colunas.area]),
        ...(matriculaId ? { matricula_id: matriculaId } : {}),
      }, cache, rel);

      // 5. Nº Decreto → parcelamento_dados (tabela do APP, não do Núcleo)
      const decreto = String(row[colunas.numero_decreto] ?? '').trim();
      if (decreto) {
        const chaveDecreto = `decreto|${parc.id}`;
        if (!cache.has(chaveDecreto)) {
          if (EXECUTAR) {
            await req(`/parcelamento-dados/${parc.id}`, {
              method: 'PUT',
              body: JSON.stringify({ numero_decreto: decreto }),
            });
            conta(rel.atualizados, 'parcelamento_dados');
          } else {
            conta(rel.atualizados, 'parcelamento_dados (simulado)');
          }
          cache.set(chaveDecreto, true);
        }
      }

      // 6. Preço → preco_estatico, que é GRAVAÇÃO ÚNICA.
      //
      // Se já existe, NÃO sobrescreve: o campo é o registro de um contrato
      // firmado, e perdê-lo é a razão de ele existir. A divergência entra no
      // relatório para alguém decidir — o script não decide por ninguém.
      const preco = normalizarPreco(row[colunas.preco]);
      if (preco.ambiguo) {
        // Separador indecidível: `1.234` é 1234 em pt-BR e 1,234 em inglês.
        // Gravar um chute num campo de gravação única exigiria a rota de
        // correção, que é só do admin — melhor reportar e deixar sem preço.
        rel.divergencias.push(
          `Linha ${nLinha}: preço '${preco.ambiguo}' tem separador ambíguo (ponto com 3 casas). `
          + 'Não importado — corrija o CSV para 1.234,00 ou 1234.',
        );
      } else if (preco.valor !== null && typeof lote.id === 'number') {
        if (EXECUTAR) {
          try {
            await req(`/imovel-dados/lote/${lote.id}/preco-estatico`, {
              method: 'POST',
              body: JSON.stringify({ preco_estatico: preco.valor }),
            });
            conta(rel.criados, 'preco_estatico');
          } catch (e) {
            if (e.status === 409) {
              rel.divergencias.push(
                `Linha ${nLinha}: lote ${lote.id} já tem preço de contrato gravado; `
                + `o Planilhão traz ${preco.valor}. Não sobrescrito.`,
              );
            } else throw e;
          }
        } else {
          conta(rel.criados, 'preco_estatico (simulado)');
        }
      }

      // 7. Morador + vínculo com o lote.
      const cpf = soDigitos(row[colunas.cpf]);
      if (cpf && cpf.length === 11 && row[colunas.morador_nome]) {
        const pessoa = await upsert('pessoa_fisica', ENDPOINTS.pessoas_fisicas, { cpf }, {
          nome: row[colunas.morador_nome],
          cpf,
        }, cache, rel);

        // O vínculo tem endpoint desde sempre — o TODO da versão anterior
        // estava vencido. `POST /lotes/:id/pessoas` exige `escrever` em imoveis.
        if (EXECUTAR && typeof lote.id === 'number' && typeof pessoa.id === 'number') {
          try {
            await req(`${ENDPOINTS.lotes}/${lote.id}/pessoas`, {
              method: 'POST',
              body: JSON.stringify({ pessoa_id: pessoa.id, tipo_vinculo: 'posse_legitima' }),
            });
            conta(rel.criados, 'vinculo_morador');
          } catch (e) {
            // Vínculo repetido não é erro de importação: é reimportação.
            if (e.status === 409) conta(rel.ignorados, 'vinculo_morador (já existia)');
            else throw e;
          }
        } else if (!EXECUTAR) {
          conta(rel.criados, 'vinculo_morador (simulado)');
        }
      }

      // 8. Uso e Tipo de Lote — SEM destino ainda.
      //
      // O catálogo (#22) não fechou, e a decisão é que esses campos vão morar no
      // objeto Lote do Núcleo, não numa tabela do app. Gravar agora criaria uma
      // segunda fonte da verdade para o mesmo dado. Vão para o relatório.
      const uso = String(row[colunas.uso] ?? '').trim();
      const tipoLote = String(row[colunas.tipo_lote] ?? '').trim();
      if (uso || tipoLote) {
        rel.catalogoPendente.push(`Linha ${nLinha}: uso='${uso}' tipo_lote='${tipoLote}'`);
      }

      // 9. Transação — entidade não existe no Núcleo (#36).
      if (temTransacaoPendente(row, colunas)) {
        rel.transacoesPendentes.push(
          `Linha ${nLinha}: status='${row[colunas.status_transacao]}' no lote ${lote.id}`,
        );
      }
    } catch (e) {
      if (e.fatal) throw e;
      rel.erros.push(`Linha ${nLinha}: ${e.message}`);
    }
  }
  return rel;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function imprimirRelatorio(rel, linhas) {
  const bloco = (titulo, mapa) => {
    const entradas = Object.entries(mapa);
    if (entradas.length === 0) return;
    console.log(`\n${titulo}`);
    for (const [k, v] of entradas) console.log(`  ${k}: ${v}`);
  };

  console.log(`\n== Relatório (${linhas.length} linhas lidas) ==`);
  bloco('Criados', rel.criados);
  bloco('Atualizados', rel.atualizados);
  bloco('Ignorados (já existiam)', rel.ignorados);

  const lista = (titulo, arr, explicacao) => {
    if (arr.length === 0) return;
    console.log(`\n${titulo}: ${arr.length}`);
    if (explicacao) console.log(`  ${explicacao}`);
    for (const l of arr.slice(0, 30)) console.log(`  ${l}`);
    if (arr.length > 30) console.log(`  … +${arr.length - 30}`);
  };

  lista('Divergências de preço', rel.divergencias,
    'Preço de contrato já gravado NÃO foi sobrescrito. Decida caso a caso.');
  lista('Transações pendentes', rel.transacoesPendentes,
    'A entidade Transação não existe no Núcleo (#36). Estas linhas não foram importadas.');
  lista('Uso / Tipo de Lote pendentes', rel.catalogoPendente,
    'O catálogo (#22) não fechou e o destino será o objeto Lote do Núcleo. Não gravado.');
  lista('Erros', rel.erros);
}

async function main() {
  const caminho = process.argv.find((a) => a.endsWith('.csv'));
  if (!caminho) {
    console.error('Uso: URBI_BASE=... URBI_TOKEN=... node scripts/importar-planilhao.mjs planilhao.csv [--executar]');
    process.exit(1);
  }
  if (EXECUTAR && !TOKEN) {
    console.error('URBI_TOKEN é obrigatório para --executar');
    process.exit(1);
  }
  const fs = await import('node:fs/promises');
  const linhas = parseCsv(await fs.readFile(caminho, 'utf-8'));

  const conflito = SIMULAR && process.argv.includes('--executar');
  console.log(`Modo: ${EXECUTAR ? 'EXECUTAR (escreve)' : 'SIMULAÇÃO (nada é escrito)'}`);
  if (conflito) console.log('  (--simular e --executar juntos: o modo seguro venceu)');
  console.log(`Base: ${BASE}`);

  const rel = novoRelatorio();
  try {
    await importar(linhas, rel);
  } catch (e) {
    imprimirRelatorio(rel, linhas);
    console.error(`\n== IMPORTAÇÃO INTERROMPIDA ==\n${e.message}`);
    process.exit(3);
  }

  imprimirRelatorio(rel, linhas);
  process.exit(rel.erros.length ? 2 : 0);
}

// Só roda como CLI; importado por teste, não executa.
if (process.argv[1] && process.argv[1].endsWith('importar-planilhao.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
