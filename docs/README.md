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

## VGV

Σ (preço aplicável × área) de **todos** os lotes — potencial, não realizado — e o número diz sobre quantos lotes foi feito. Ver [vgv.md](vgv).

## Moradores

Lista de pessoas do Núcleo, com busca de servidor. A coluna de imóveis depende de um recorte escolhido pelo usuário, porque o Núcleo não expõe pessoa → imóveis — e a situação de cadastro tem **três** estados por causa disso. Ver [moradores.md](moradores).

## Ações judiciais

Sobre imóveis **e/ou** pessoas, com o polo (`UP contra` / `contra UP`) guardado como dado e o título montado de uma função só. Ver [acoes.md](acoes).

## Quitação

Marca, não cálculo — o app registra que alguém constatou, com autoria e data. Gate de `validador_interno`, rota própria, e uma guarda que impede rota descritiva de escrever o campo. Ver [quitacao.md](quitacao).

## Preços

Precedência: **contrato gravado** → **preço manual** → **proposta vigente** em cascata. O de contrato é imutável de propósito — ver [precos.md](precos).

## Divisão Núcleo × App

- **Núcleo** — entidades transversais consumidas por leitura: `setores_habitacionais`, `parcelamentos`, `incorporacoes`, `imoveis` (lote/gleba/unidade), `matriculas`, `pessoas` (física/jurídica). Escrita apenas em `pessoas` (vincular moradores).
- **App (`reg360`)** — tudo que o Núcleo não tem e não vai ter, porque o monorepo é somente leitura: `propostas` (condições comerciais por período), `parcelamento_dados` (trâmite de regularização), `imovel_dados` (preços e quitação) e as três tabelas de `acoes` (ações judiciais e seus vínculos com imóveis e pessoas).

Sem FK direta para o Núcleo — apenas referência lógica por ID, acessada via `req.nucleo` (backend) e `urbiVerso.nucleo()` (frontend).

## Transação (dependência futura do Núcleo)

A entidade Transação ainda não existe no Núcleo. O app está preparado para ela num **adaptador de três arquivos**, com um interruptor único (`DISPONIVEL`): as derivações de data de assinatura e de estágio já estão escritas e testadas com dados sintéticos, e a aba do lote explica o que falta em vez de mostrar botão morto. O roteiro do dia da virada — inclusive o que **não** fazer com o `preco_estatico` — está em [transacao-integracao.md](transacao-integracao).

## Estado atual

**Fase 0 — scaffold.** Estrutura do app, manifesto, roles e navegação declarados; backend com endpoint de sanidade (`GET /ping`); frontend placeholder. As próximas fases adicionam `schema.json` (propostas), rotas de negócio + cascata, eventos + rotina de vencimento, e a UI territorial com componentes `urbi-*`.
