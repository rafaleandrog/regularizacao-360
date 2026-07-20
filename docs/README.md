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

- Navegação hierárquica: Setor Habitacional → Parcelamento → Lote → Unidade (dados do Núcleo)
- Gestão de propostas comerciais com resolução em cascata (Setor → Parcelamento → Unidade)
- Dashboard de KPIs (áreas, contagens; VGV quando Transação existir no Núcleo)
- Fluxo de aprovação de propostas com roles (`criador`, `validador_interno`, `editor_regularizacao`)

## Divisão Núcleo × App

- **Núcleo** — entidades transversais consumidas por leitura: `setores_habitacionais`, `parcelamentos`, `incorporacoes`, `imoveis` (lote/gleba/unidade), `matriculas`, `pessoas` (física/jurídica). Escrita apenas em `pessoas` (vincular moradores).
- **App (`reg360`)** — único dado próprio: a tabela `propostas` (condições comerciais vigentes por período).

Sem FK direta para o Núcleo — apenas referência lógica por ID, acessada via `req.nucleo` (backend) e `urbiVerso.nucleo()` (frontend).

## Transação (dependência futura do Núcleo)

A entidade Transação ainda não está disponível no Núcleo. O app é construído preparado para ela: as rotas de proxy retornam `501/503` e a UI de "Criar Transação" fica desabilitada até o módulo existir. KPIs de VGV exibem placeholder nesse intervalo.

## Estado atual

**Fase 0 — scaffold.** Estrutura do app, manifesto, roles e navegação declarados; backend com endpoint de sanidade (`GET /ping`); frontend placeholder. As próximas fases adicionam `schema.json` (propostas), rotas de negócio + cascata, eventos + rotina de vencimento, e a UI territorial com componentes `urbi-*`.
