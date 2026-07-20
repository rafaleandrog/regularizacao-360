# Regularização 360 (`reg360`)

App UrbiVerso de gestão do ciclo de vida da regularização fundiária da Fazenda Paranoazinho — navegação territorial (Setor → Parcelamento → Lote → Unidade, dados do Núcleo), propostas comerciais com resolução em cascata, aprovação com papéis e dashboard de status.

Este repositório segue o padrão **app em repositório próprio** do UrbiVerso: o app vive na raiz e é distribuído como pacote `.urbiapp.tgz` via GitHub Release, instalável numa instância por `Admin → Apps`. Documentação funcional em [`docs/`](docs) e spec original em `regularizacao-360-v1-0-spec.md`.

## Estrutura

```
manifesto.json     # capacidades: roles, nav, eventos, rotinas, dependências do Núcleo
schema.json        # tabela própria: propostas (restrito + soft_delete)
backend/rotas.ts   # rotas customizadas (propostas, cascata, aprovação) + rotina + eventos
frontend/index.ts  # web component app-reg360 (Lit + componentes urbi-*)
comum/cascata.ts   # lógica pura de vigência/cascata (testada)
scripts/           # importador determinístico do Planilhão
docs/              # documentação do app (README, cascata, fluxos, importação, operação)
```

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

Para testar dentro do shell, faça symlink deste repo para `apps/reg360/` de um clone do monorepo `UP-Urbita/urbiverso` e rode o shell.

## Release e instalação

O workflow `.github/workflows/release.yml` empacota e publica um GitHub Release. Dispare por:

- **Actions → release → Run workflow** (cria a tag `reg360-v<versao>_<sha8>` do commit), ou
- **push de tag** `reg360-v<x.y.z>_<sha8>` (a versão deve bater com `manifesto.json`).

O release anexa `reg360-<versao>.urbiapp.tgz` + `.sha256`. Na instância: `Admin → Apps → Instalar` (do release do repo ou upload do tarball). Após instalar, habilite as flags de Núcleo e atribua os papéis — ver [`docs/operacao.md`](docs/operacao.md).

## Estado

MVP das 6 fases concluído (scaffold → schema → backend/cascata → eventos/rotina → frontend → import/docs). Preparado para a entidade **Transação** do Núcleo (rotas em `501`, aba desabilitada) até ela existir.
