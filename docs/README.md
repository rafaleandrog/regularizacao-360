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
| `/parcelamentos/setor/sem` | Os parcelamentos **fora de qualquer setor** (`setor_habitacional_id` nulo) |
| `/parcelamentos/fase/:fase` | A mesma lista, filtrada por fase de regularização |
| `/parcelamento/:id` | Detalhe do Parcelamento — KPIs, abas Lotes e Propostas |
| `/lotes` | Lista de Lotes da instância, com busca e paginação **de servidor** |
| `/lote/:id` | Detalhe do Lote |
| `/moradores` | Lista de Moradores, com busca de servidor |
| `/morador/:id` | Detalhe do Morador |
| `/unidade/:id` | Detalhe da Unidade (só onde há incorporação) |
| `/proposta/:id` | Detalhe da Proposta |

O filtro de Setor vai **na sub-rota**, não em query string: `subRota()` do shell é montada só do `pathname`, então `?setor=2` não chegaria à app. Como está, a tela filtrada é compartilhável e o botão voltar do navegador funciona.

O termo de busca **não** entra na rota — é transitório por decisão, para não poluir o histórico a cada tecla.

**O nav tem fonte única.** A lista vive em `comum/navegacao.ts`; a barra da app deriva dela, e `backend/__tests__/navegacao.test.ts` amarra o `nav` do `manifesto.json` item a item, por contagem exata. A duplicação é imposta pela plataforma — o shell lê JSON e não importa TypeScript — mas divergir entre os dois agora quebra um teste em vez de falhar calado.

**Falha ao carregar ocupantes não vira `—`.** Na tabela de lotes, o lote cuja requisição de `imovel_pessoas` falhou aparece marcado como *não carregou*, distinto de `—` (que significa "nenhum ocupante"). Abaixo da tabela, a contagem e um botão de tentar de novo. Antes os dois casos eram idênticos na tela, e ninguém investiga o que parece normal.

**A aba de topo é Lotes, não Unidades.** Até a v0.9.0 o nav trazia uma entrada `/unidades` herdada da spec v0.9, que listava `GET /unidades` sem filtro. No Núcleo, `unidades.incorporacao_id` é NOT NULL — unidade só existe sob incorporação — e o inventário real da instância são os ~6.200 lotes. A aba, portanto, só sabia ficar vazia, enquanto o objeto de navegação do app (o Lote) não tinha entrada nenhuma. `/unidade/:id` continua existindo, alcançada pelo detalhe do lote.

A lista de Lotes **pagina e busca no servidor**: `GET /lotes` aceita `busca` (ILIKE sobre `numero_lote`, `quadra`, `conjunto` e `rua`) e devolve `total`. Varrer 6.200 registros para exibir 25 linhas seriam 32 requisições por tela.

**O detalhe do Setor explica a tabela vazia.** Se o recorte por `setor_habitacional_id` volta sem nada, a tela diz qual dos casos é: não há parcelamento neste setor (e informa quantos a instância tem), ou não há parcelamento nenhum. `setor_habitacional_id` é nullable no Núcleo, então parcelamento sem setor aparece em `/parcelamentos` e em setor nenhum — tabela muda não distinguiria isso de base que não carregou.

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

  O app **escreve** em quatro delas, e em contextos estreitos:

  | Entidade | Quem escreve |
  |---|---|
  | `pessoas` | As telas (cadastrar morador) e o importador |
  | `imoveis` | As telas — **vincular e desvincular morador do lote** passa por `POST /lotes/:id/pessoas`, que é gate de `imoveis` — e o importador, que cria lote |
  | `parcelamentos`, `matriculas` | Só o importador do Planilhão |

  Cortar `imoveis:escrever` achando que é só do importador **quebra o cadastro de morador pela tela**. As flags e quem as liga estão em [operacao.md](operacao).
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
| ~~`pnpm-lock.yaml` e piso de `sdk_min`~~ | **Resolvido** — lockfile versionado, `sdk_min: 52` e `shell_min: "0.53.10"` declarados |

**Este doc é a fonte da verdade.** A spec v0.9 foi aposentada para [`historico/spec-v0.9.md`](historico/spec-v0.9) — ela registra as decisões e as datas, mas boa parte dela não descreve o app que existe.
