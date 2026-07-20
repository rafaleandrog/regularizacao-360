---
titulo: Operação e Deploy
descricao: Build, registro e checklist de ativação do reg360 numa instância.
tipo:
---

# Operação e deploy

## Build e registro

```bash
# na pasta da app
pnpm install
pnpm build            # esbuild: frontend/index.js + backend/rotas.js

# na raiz do monorepo
npm run registrar     # regenera apps.json (o shell descobre a app)
```

`apps.json`, `frontend/index.js` e `backend/rotas.js` são gerados (gitignored). O shell monta o backend em `/api/reg360/`, cria o schema `reg360` e sincroniza a tabela `propostas` no boot.

## Checklist de ativação (admin da instância)

1. **Registrar e subir** a app (build + `registrar` + restart do shell).
2. **Habilitar flags de Núcleo** em `Admin → Apps → reg360 → Núcleo` (começam desligadas):
   - `pessoas`: ler, escrever
   - `imoveis`: ler, escrever, remover
   - `parcelamentos`: ler, escrever
   - `matriculas`: ler, escrever
   - `setores_habitacionais`: ler · `incorporacoes`: ler
3. **Confirmar permissão padrão** do app = `leitura` (todos consultam).
4. **Atribuir papéis** em `Configurações → Usuários`: `criador`, `validador_interno`, `editor_regularizacao` aos usuários certos.
5. **Rotina** `checar_propostas_vencendo` — conferir em `Config → Rotinas` (frequência diária; horário no fuso da organização; toggle ativa; "Rodar agora" para testar).
6. **Importação inicial** — ver [importacao.md](importacao) (setores pré-criados via `editor_nucleo`; dry-run → executar).

## Dependência externa — Transação

O app está preparado para a Transação, mas ela **ainda não existe no Núcleo**. Enquanto isso: aba Transações desabilitada, rotas de transação em `501`, KPI de VGV com placeholder. Quando o módulo existir, declarar `transacoes` em `dependencias_nucleo`/`permissoes_nucleo`, habilitar as flags e ativar as rotas de proxy.

## Testes

```bash
node --test apps/reg360/backend/__tests__/cascata.test.ts
```

Cobrem a lógica pura de vigência e cascata (`comum/cascata.ts`). A verificação end-to-end (rotas, render, criação no Núcleo) exige o shell rodando contra Postgres.
