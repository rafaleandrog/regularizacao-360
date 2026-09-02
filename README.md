# Regularização 360 (`reg360`)

App UrbiVerso de gestão do ciclo de vida da regularização fundiária da Fazenda Paranoazinho — navegação territorial, propostas comerciais em cascata, preços e VGV, regularização do parcelamento, ações judiciais, moradores e quitação.

**O objeto de navegação é o Lote.** No Núcleo, `unidades.incorporacao_id` é NOT NULL: unidade só existe sob incorporação, e a maioria dos lotes não tem uma. O caminho real é Setor → Parcelamento → **Lote**, com Unidade abaixo do lote onde há incorporação.

Este repositório segue o padrão **app em repositório próprio** do UrbiVerso: o app vive na raiz e é distribuído como pacote `.urbiapp.tgz` via GitHub Release, instalável numa instância por `Admin → Apps`.

Documentação em [`docs/`](docs) — comece pelo [`docs/README.md`](docs/README.md). A spec v0.9 foi aposentada para [`docs/historico/spec-v0.9.md`](docs/historico/spec-v0.9.md): ela registra as decisões e as datas, mas **não é contrato**.

## Estrutura

```
manifesto.json   # capacidades: roles, nav, eventos, rotinas, dependências do Núcleo
schema.json      # as 6 tabelas do schema reg360 (todas restrito + soft_delete)

backend/         # rotas.ts monta o resto: propostas, parcelamento-dados, imovel-dados,
                 # acoes, transacoes (adaptador), moradores, upsert
comum/           # lógica pura, testada com node:test e compartilhada entre as camadas:
                 # cascata, preco, agregados, regularizacao, acoes, moradores,
                 # quitacao, transacoes-contrato, paginacao, busca, concorrencia
frontend/        # index.ts (web component app-reg360, Lit + urbi-*), nucleo-cliente.ts
                 # (a única porta de leitura do Núcleo), reg360-api.ts, transacoes.ts
scripts/         # importador do Planilhão (ferramenta de operação, não runtime)
docs/            # documentação — comece pelo docs/README.md
```

A lógica de negócio mora em `comum/`, e não nas rotas ou nas telas, porque é o que permite testá-la sem subir shell nem banco: os **261 testes** cobrem `comum/` e as partes puras do importador.

## Desenvolvimento

Pré-requisito: **PAT *classic* do GitHub com `read:packages`** (o `@urbiverso/sdk` é privado, na org `urbiverso`; o registry npm do GitHub não autentica PAT fine-grained). O `.npmrc` do repo já lê o token do ambiente — exporte a variável, não escreva o segredo em arquivo:

```bash
export URBIVERSO_PACKAGES_TOKEN=<PAT classic com read:packages>
```

**Sem essa variável o sintoma não parece de credencial.** O `.npmrc` do projeto expande `${URBIVERSO_PACKAGES_TOKEN}`, e quando a variável não existe o pnpm **descarta o arquivo inteiro** — um `WARN  Failed to replace env in config` e pronto. Junto com o token cai a linha `@urbiverso:registry`, então `@urbiverso/sdk` passa a ser procurado no npmjs.org, que responde **404** em vez de 401. Se vir isso, confira a variável antes de suspeitar do PAT.

Depois:

```bash
pnpm install        # --frozen-lockfile no CI; o pnpm-lock.yaml é versionado
pnpm build          # esbuild → backend/rotas.js + frontend/index.js
pnpm test           # testes das funções puras (node:test via tsx)
pnpm typecheck      # tsc --noEmit
pnpm empacotar      # urbi-empacotar reg360 → dist/reg360-<versao>.urbiapp.tgz
```

Para testar dentro do shell, faça symlink deste repo para `apps/reg360/` de um clone do monorepo `urbiverso/urbiverso` e rode o shell.

**Teste de app é na instância intermediária** (Pinguim), nunca na de desenvolvimento: ela roda build não homologado, e aviso de obsolescência lido lá é sinal errado.

## Release e instalação

O workflow `.github/workflows/release.yml` empacota e publica um GitHub Release. Dispare por:

- **Actions → release → Run workflow** (cria a tag `reg360-v<versao>_<sha8>` do commit), ou
- **push de tag** `reg360-v<x.y.z>_<sha8>` (a versão deve bater com `manifesto.json`).

O release anexa `reg360-<versao>.urbiapp.tgz` + `.sha256`. Na instância: `Admin → Apps → Instalar` (do release do repo ou upload do tarball). Após instalar, habilite as flags de Núcleo e atribua os papéis — ver [`docs/operacao.md`](docs/operacao.md).

### Os dois pisos de plataforma

O `manifesto.json` declara **dois pisos independentes e cumulativos** — a instância precisa atender aos dois:

| Piso | Valor | O que atesta |
|---|---|---|
| `sdk_min` | `52` | O nível de `@urbiverso/sdk` contra o qual o app compila (inteiro, nunca `"52.0.0"`) |
| `shell_min` | `"0.53.10"` | Que o **gate de `sdk_min` existe** naquela instância |

O par não é redundância. O validador de manifesto **ignora chave desconhecida**: num shell anterior a `0.53.10` o `sdk_min` não é reprovado — ele simplesmente não é visto, e o app instala limpo para quebrar na primeira chamada. `shell_min` é o que fecha esse buraco.

`sdk_min` copia o major do SDK do `package.json` (`"@urbiverso/sdk": "52.0.0"` → `52`), como manda a doc do SDK: quem compila contra o 52 roda no 52, e declarar 52 **nunca subdeclara**. Sobredeclarar custa recusa numa instância mais velha; subdeclarar custa quebra em runtime na instância de outra pessoa — assimetria que decide a regra.

**Mexer em qualquer um dos dois faz a `versao` do manifesto avançar**, mesmo sem migração: sem isso, duas builds com o mesmo `x.y.z` passariam a exigir plataformas diferentes.

**A release nasce NÃO homologada**, sempre (`--prerelease`). No shell, "homologada" é o campo nativo `prerelease` do GitHub invertido, e homologar é ato de quem atesta — não propriedade do build.

Consequência que morde: o app precisa estar com **`Nível de aceitação = Releases`** na instância. No padrão (`homologado`), a release aparece no modal de upgrade e é **descartada na hora de aplicar**. Ver [`docs/operacao.md`](docs/operacao.md) § Homologação.

## Estado

Completo em código, **ainda não instalado numa instância**. O que falta depende de coisas fora deste repo — catálogo de Uso, a entidade Transação existir no Núcleo, o release na Pinguim e um PAT com `read:packages`. A lista está em [`docs/README.md`](docs/README.md) § Estado atual.
