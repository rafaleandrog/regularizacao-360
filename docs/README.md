---
titulo: Regularização 360
descricao: Gestão do ciclo de vida da regularização fundiária da Fazenda Paranoazinho — visão geral do app.
tipo:
---

# Regularização 360 (reg360)

> Fonte única da verdade para a regularização fundiária da UP: navegação territorial, propostas comerciais e acompanhamento de status.

## O que é

A UP opera a regularização de condomínios informais na Fazenda Paranoazinho. O processo envolve controlar setores habitacionais, parcelamentos (condomínios), lotes, unidades, moradores, propostas comerciais e — futuramente — transações jurídico-comerciais.

O app centraliza tudo no UrbiVerso, com:

- Navegação hierárquica: Setor Habitacional → Parcelamento → **Lote** (dados do Núcleo)
- Gestão de propostas comerciais com resolução em cascata (Setor → Parcelamento → Unidade)
- Dashboard de KPIs (áreas, contagens; VGV quando Transação existir no Núcleo)
- Fluxo de aprovação de propostas com roles (`criador`, `validador_interno`, `editor_regularizacao`)

## Como o app lê o Núcleo

Toda leitura passa por `frontend/nucleo-cliente.ts`, que pagina em laço, memoriza por sessão e distingue flag desligada de lista vazia. O motivo não é gosto: `req.nucleo` **não lê** no backend, e o Núcleo pagina em 200 sem equivalente ao `varrerTudo`. Ver [leitura-nucleo.md](leitura-nucleo).

## Navegação

| Rota | Tela |
|---|---|
| `/` | Setores Habitacionais (cards) |
| `/setor/:id` | Detalhe do Setor — KPIs, abas Empreendimentos e Propostas |
| `/parcelamentos` | Lista de Parcelamentos (cards), com busca |
| `/parcelamentos/setor/:id` | A mesma lista, filtrada por Setor |
| `/parcelamentos/fase/:fase` | A mesma lista, filtrada por fase de regularização |
| `/parcelamento/:id` | Detalhe do Parcelamento — KPIs, abas Lotes e Propostas |
| `/lote/:id` | Detalhe do Lote |
| `/unidade/:id` | Detalhe da Unidade (só onde há incorporação) |
| `/proposta/:id` | Detalhe da Proposta |

O filtro de Setor vai **na sub-rota**, não em query string: `subRota()` do shell é montada só do `pathname`, então `?setor=2` não chegaria à app. Como está, a tela filtrada é compartilhável e o botão voltar do navegador funciona.

O termo de busca **não** entra na rota — é transitório por decisão, para não poluir o histórico a cada tecla.

## Regularização do Parcelamento

Duas classificações independentes — a **fase** derivada das datas do trâmite (Irregular → Em análise → Aprovado → Registrado) e a **situação registral** (Caucionado / Prenotado), que é eixo ortogonal. Ver [regularizacao.md](regularizacao).

## Preços

Precedência: **contrato gravado** → **preço manual** → **proposta vigente** em cascata. O de contrato é imutável de propósito — ver [precos.md](precos).

## Divisão Núcleo × App

- **Núcleo** — entidades transversais consumidas por leitura: `setores_habitacionais`, `parcelamentos`, `incorporacoes`, `imoveis` (lote/gleba/unidade), `matriculas`, `pessoas` (física/jurídica). Escrita apenas em `pessoas` (vincular moradores).
- **App (`reg360`)** — único dado próprio: a tabela `propostas` (condições comerciais vigentes por período).

Sem FK direta para o Núcleo — apenas referência lógica por ID, acessada via `req.nucleo` (backend) e `urbiVerso.nucleo()` (frontend).

## Transação (dependência futura do Núcleo)

A entidade Transação ainda não está disponível no Núcleo. O app é construído preparado para ela: as rotas de proxy retornam `501/503` e a UI de "Criar Transação" fica desabilitada até o módulo existir. KPIs de VGV exibem placeholder nesse intervalo.

## Estado atual

**Fase 0 — scaffold.** Estrutura do app, manifesto, roles e navegação declarados; backend com endpoint de sanidade (`GET /ping`); frontend placeholder. As próximas fases adicionam `schema.json` (propostas), rotas de negócio + cascata, eventos + rotina de vencimento, e a UI territorial com componentes `urbi-*`.
