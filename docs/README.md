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
- Gestão de propostas comerciais com resolução em cascata nos **quatro** níveis (Setor → Parcelamento → Lote → Unidade)
- KPIs de área, contagem e **VGV** — que é calculado hoje, e não depende da Transação
- Regularização do parcelamento, ações judiciais, moradores e quitação
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
| `/moradores` | Lista de Moradores, com busca de servidor |
| `/morador/:id` | Detalhe do Morador |
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

## Modelo de dados

As seis tabelas do schema `reg360` e **por que cada uma existe fora do Núcleo** estão em [modelo-dados.md](modelo-dados). A pergunta que ele responde é sempre a mesma: por que este campo não está lá?

## Divisão Núcleo × App

- **Núcleo** — entidades transversais, consumidas sobretudo por **leitura**: `setores_habitacionais`, `parcelamentos`, `incorporacoes`, `imoveis` (lote/gleba/unidade), `matriculas`, `pessoas` (física/jurídica).

  O app **escreve** em quatro delas, e em contextos estreitos: `pessoas` (cadastrar morador — a única escrita das telas), e `imoveis`, `parcelamentos` e `matriculas`, que só o importador do Planilhão usa. As flags e quem as liga estão em [operacao.md](operacao).
- **App (`reg360`)** — tudo que o Núcleo não tem e não vai ter, porque o monorepo é somente leitura: `propostas` (condições comerciais por período), `parcelamento_dados` (trâmite de regularização), `imovel_dados` (preços e quitação) e as três tabelas de `acoes` (ações judiciais e seus vínculos com imóveis e pessoas).

Sem FK direta para o Núcleo — apenas referência lógica por ID, acessada via `req.nucleo` (backend) e `urbiVerso.nucleo()` (frontend).

## Transação (dependência futura do Núcleo)

A entidade Transação ainda não existe no Núcleo. O app está preparado para ela num **adaptador de três arquivos**, com um interruptor único (`DISPONIVEL`): as derivações de data de assinatura e de estágio já estão escritas e testadas com dados sintéticos, e a aba do lote explica o que falta em vez de mostrar botão morto. O roteiro do dia da virada — inclusive o que **não** fazer com o `preco_estatico` — está em [transacao-integracao.md](transacao-integracao).

## Estado atual

O app está **completo em código** e ainda **não instalado numa instância**. Navegação territorial, propostas em quatro níveis com cascata, preços, VGV, regularização do parcelamento, ações judiciais, moradores e quitação: tudo escrito, testado e documentado.

Falta o que depende de coisas fora daqui:

| Pendência | Depende de |
|---|---|
| Catálogo de **Uso** e **Tipo de Lote** | Definição do negócio — e o destino é o objeto Lote do Núcleo, não uma tabela daqui |
| **Transação** | A entidade existir no Núcleo. O adaptador está pronto, com interruptor único |
| **Release e QA** na instância intermediária | Instalação na Pinguim |
| `pnpm-lock.yaml` e piso de `sdk_min` | PAT com `read:packages` |

**Este doc é a fonte da verdade.** A spec v0.9 foi aposentada para [`historico/spec-v0.9.md`](historico/spec-v0.9) — ela registra as decisões e as datas, mas boa parte dela não descreve o app que existe.
