---
titulo: Regularização do Parcelamento
descricao: As duas classificações do parcelamento — fase derivada das datas e situação registral — e por que elas vivem no schema do app.
tipo:
---

# Regularização do Parcelamento

> O acompanhamento da regularização não cabe no Núcleo, e por isso mora aqui. São **duas classificações independentes**, não uma fila de cinco estados.

## "Irregular" só é dito depois de ler

`faseRegularizacao` deriva a fase das datas do trâmite, e devolve **`irregular`** quando não há registro em `parcelamento_dados`. Isso está certo: parcelamento sem linha lá de fato não começou a regularizar.

**O que não pode é perguntar com o mapa vazio.** A carga de `parcelamento_dados` é disparada em segundo plano (`void this._carregarRegularizacao()`), então há uma janela em toda abertura de tela — e, se a requisição falhar, o mapa fica vazio para sempre. Nos dois casos a tela derivava `irregular` e carimbava **todos os 60 parcelamentos** como irregulares.

"Irregular" não é rótulo neutro: é afirmação sobre a situação jurídica de um empreendimento. Dizê-la em massa porque uma requisição falhou é o erro mais caro desta classe.

Por isso `_faseDe` devolve `null` enquanto `regularizacaoLida` for falso, e o badge vira **`fase não lida`** (`BADGE_FASE_NAO_LIDA`), em cor neutra que não se confunde com nenhuma fase real — há teste garantindo isso.

**O filtro por fase acompanha:** com a carga pendente, ele não corta. Filtrar sobre dado não lido devolveria lista vazia com a mensagem "nenhum parcelamento com esse filtro" — outra afirmação sem base.

## Por que no app, e não no Núcleo

O Núcleo tem `data_registro`, `area` e `regularizacao` (booleano) no parcelamento, e deriva daí um `status` de três valores: `registrado`, `irregular`, `nao_registrado`. É o fato **registral** — o cartório.

O que a UP acompanha é outra coisa: o trâmite do projeto urbanístico pelo GDF, com Nº de Decreto, áreas de poligonal/viário/servidão e matrícula-mãe. Nada disso existe no Núcleo, e o monorepo é somente leitura para este trabalho — então vira a tabela `parcelamento_dados` no schema `reg360`, referenciando o parcelamento por **id lógico**, sem FK.

## As duas classificações

### 1. Fase de regularização — derivada, nunca persistida

Avaliada na **ordem inversa**, do estágio mais avançado ao mais inicial. O primeiro campo preenchido determina a fase:

| Fase | Condição |
|---|---|
| **Registrado** | `data_decreto_gdf` preenchida |
| **Aprovado** | `data_aprovacao_conplan` preenchida |
| **Em análise** | `data_envio_projeto` preenchida |
| **Irregular** | nenhuma preenchida |

A ordem inversa importa: com as três datas preenchidas o resultado é **Registrado**, não "Em análise". E um parcelamento que pulou etapa — decreto sem CONPLAN registrado — ainda é Registrado, porque o fato mais avançado é o que vale.

Parcelamento sem registro em `parcelamento_dados` é **Irregular**. Não é erro nem ausência: é o estado inicial legítimo de todo parcelamento.

**A fase não é escolhida, é consequência.** O formulário não tem campo "fase" — preencher uma data move o parcelamento sozinho, e a tela mostra para onde ele foi antes de salvar.

### 2. Situação registral — campo próprio, eixo ortogonal

`nenhuma` · `caucionado` · `prenotado`.

É **independente** da fase: um parcelamento pode estar Aprovado **e** Caucionado ao mesmo tempo. A tela do legado misturava os dois numa faixa de chips só — `Irregular | Em Análise | Caucionado | Aprovado | Registrado` — e com isso marcar "Caucionado" escondia um parcelamento que também estava Aprovado.

Aqui são dois eixos. A fase tem chips de filtro; a situação registral aparece como badge só quando é **exceção** (`nenhuma` não vira badge) e como contagem na lista.

### 3. O `status` do Núcleo continua visível

Exibido no detalhe como "Registro no Núcleo", ao lado dos demais. É dado registral de apoio e **não compete** com a fase — são perguntas diferentes: "o cartório registrou?" contra "onde está o projeto no trâmite?".

## Quem pode editar

O role **`editor_regularizacao`**, ou admin da app. Não `criador`, não `validador_interno` — são alçadas diferentes, e a tela reflete isso: sem o role, os campos aparecem em leitura e o botão de editar **não existe** (não basta desabilitar).

Este é o primeiro uso do `editor_regularizacao`, que estava declarado no manifesto desde o começo sem nenhum código por trás.

## Detalhes que mordem

**Data é string, não `Date`.** As colunas são data pura `YYYY-MM-DD`. A rota valida que o dia é de calendário real — `2026-02-30` casa o formato e não existe — e grava a string direto. Embrulhar num `Date` faz o driver re-truncar no fuso e deslocar o dia.

**Campo vazio vira `null`, não `''`.** "Limpar uma data" é uma intenção legítima, e string vazia não é data.

**O upsert roda em transação.** O registro nasce na primeira edição; há único em `parcelamento_id`, e duas requisições simultâneas não podem criar dois registros para o mesmo parcelamento.

**Área Total de Lotes e Área Privativa não são colunas.** São somatórias derivadas dos lotes (issue #29). Persistir soma é criar duas verdades que divergem na primeira importação.
