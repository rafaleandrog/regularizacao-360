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

A lógica de negócio mora em `comum/`, e não nas rotas ou nas telas, porque é o que permite testá-la sem subir shell nem banco: os **232 testes** cobrem `comum/` e as partes puras do importador.

## Desenvolvimento

Pré-requisito: **PAT do GitHub com `read:packages`** (o `@urbiverso/sdk` é privado, na org `urbiverso`). Configure uma vez no `~/.npmrc`:

```
//npm.pkg.github.com/:_authToken=SEU_PAT_read_packages
```

Depois:

```bash
pnpm install        # gera o pnpm-lock.yaml (commit necessário para o CI)
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

**A release nasce NÃO homologada**, sempre (`--prerelease`). No shell, "homologada" é o campo nativo `prerelease` do GitHub invertido, e homologar é ato de quem atesta — não propriedade do build.

Consequência que morde: o app precisa estar com **`Nível de aceitação = Releases`** na instância. No padrão (`homologado`), a release aparece no modal de upgrade e é **descartada na hora de aplicar**. Ver [`docs/operacao.md`](docs/operacao.md) § Homologação.

## Estado

Completo em código, **ainda não instalado numa instância**. O que falta depende de coisas fora deste repo — catálogo de Uso, a entidade Transação existir no Núcleo, o release na Pinguim e um PAT com `read:packages`. A lista está em [`docs/README.md`](docs/README.md) § Estado atual.
