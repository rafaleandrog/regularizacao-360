---
titulo: Preços do imóvel
descricao: A precedência entre preço de contrato, preço manual e proposta vigente — e por que o de contrato é imutável.
tipo:
---

# Preços do imóvel

> Três preços aparecem na tela do lote, e só um está valendo. Qual deles, e **por quê**, é a informação que o painel existe para dar.

## A precedência

```
preço aplicável =
    preco_estatico     (contrato firmado — gravado uma vez)
 ?? preco_m2_manual    (override digitado)
 ?? preço da proposta vigente, resolvido em cascata

valor do imóvel = preço aplicável × area_efetiva
```

**Zero é preço legítimo** e vence os seguintes: um contrato de R$ 0,00 é um fato, não um campo vazio. E `valorDoImovel` devolve `null` — nunca `0` — quando falta preço ou área, porque confundir "vale nada" com "não sabemos quanto vale" produz VGV mentiroso.

## De onde a regra saiu

Dos números das próprias telas do legado:

| Lote | Proposta vigente | Contrato | Final | Área | Valor exibido |
|---|---|---|---|---|---|
| `B Lote 1` | 300,00 | — | — | 1.008,85 | **302.655,00** = 300,00 × 1.008,85 |
| `BS Lote 1` | 190,00 | 200,00 | 161,10 | 194,82 | **31.385,99** |

O primeiro fecha ao centavo. O segundo é o que fixa a regra da **sobreposição**: se a proposta vigente valesse, o valor seria `190 × 194,82 = 37.015,80` — muito longe do exibido.

> **Nota de precisão:** `161,10 × 194,82 = 31.385,50`, e a tela mostra `31.385,99`. Os dois fatores aparecem **arredondados a 2 casas** (o preço real é ~161,1025, ou a área ~194,8230 — `imoveis.area` é `numeric(14,4)`). Não dá para reproduzir o centavo a partir de números já arredondados, e o teste diz isso explicitamente em vez de fingir uma igualdade que passaria por sorte.

## O preço de contrato é imutável, e esse é o ponto

Enquanto a entidade Transação não existir no Núcleo, `preco_estatico` é **o único lugar onde o valor combinado sobrevive**. Se puder ser sobrescrito por engano, o campo perde inteiramente o propósito — ele existe justamente para não se perder numa mudança de fórmula.

| Ação | Quem | Comportamento |
|---|---|---|
| Gravar pela primeira vez | `criador` | Grava, com data e autor |
| Gravar de novo | `criador` | **`409 REG360_PRECO_ESTATICO_GRAVADO`** |
| Corrigir um já gravado | **só admin da app** | Rota separada, com confirmação que mostra o valor a ser substituído |
| Definir/limpar preço manual | `criador` | Livre — não é contrato |

A assimetria **é** o desenho: quem grava não corrige. `validador_interno` também não passa na correção.

## O painel só afirma o que leu

Duas leituras alimentam o painel do imóvel, e as duas podem não ter acontecido:

| Leitura | O que ela traz | O que a falta dela faz, sem guarda |
|---|---|---|
| `imovel_dados` | preço de contrato e preço manual | `{}` é o caso NORMAL de imóvel nunca editado, então `preco_estatico == null` fica verdadeiro pelo motivo errado |
| contexto do imóvel | parcelamento, e o lote da unidade — os **elos da cascata** | `resolverVigente` é chamado sem `parcelamento_id` e sem `setor_id`, **pula os elos de cima**, e devolve um preço menor (ou nenhum) |

`controlesDePreco` (`comum/preco.ts`) recebe o estado das duas e decide o que a tela pode dizer e oferecer:

- **A frase "Sem preço definido: não há contrato, preço manual, nem proposta vigente na cascata"** é afirmação sobre **três** fontes, e exige as duas leituras concluídas. Sem isso ela sai enquanto a tela ainda está lendo.
- **Nenhum botão de escrita antes de a leitura concluir.** Este não é zelo genérico: com `imovel_dados` em `{}`, a tela oferecia *"Gravar preço de contrato"* para um imóvel que **tem** contrato, e o backend respondia **409 `REG360_PRECO_ESTATICO_GRAVADO`**. Botão que a API recusa não entra — a regra é do `CLAUDE.md`, e aqui ela dependia de um estado que ninguém tinha conferido.
- **A resposta guardada tem que ser a leitura certa.** `_acaoPreco` guardava em `dadosDoImovel` o retorno de qualquer ação do imóvel — inclusive o de desvincular morador, que é `{ removido: true, … }` e não tem `quitado` nem `preco_estatico`. Desvincular um morador fazia o badge "Quitado" sumir e o botão de gravar contrato reaparecer. Não é falta de leitura: é a resposta errada no lugar dela, e nenhuma guarda de estado pega isso — só o chamador dizendo se a resposta é o registro.
- **Uma frase por leitura que faltou**, como banner de aviso — `erro` quando a leitura falhou de fato, `alerta` enquanto ela só está em curso. Falha de contexto é a mais silenciosa das duas: ela não some da tela, ela **muda o número** e o apresenta como fato.

### `…` no lugar de `—`, e por que é uma decisão só

No KPI de preço, `—` diz "não tem"; enquanto uma leitura relevante ainda não concluiu, o que ele diz é "não sei" — a mesma distinção de `comum/referencias.ts`. O painel mostra **quatro** KPIs de preço, e nem todos dependem das duas leituras do mesmo jeito:

| KPI | Depende de | Marcador de ausência |
|---|---|---|
| Preço de contrato | só `imovel_dados` | `…` enquanto ela corre ou falha, `—` só depois de concluída |
| Preço proposta vigente | só o contexto (a cascata) | `…` enquanto ele corre ou falha, `—` só depois de concluído |
| Valor do imóvel | as **duas** | `marcadorPrecoAusente` |
| Preço final | as **duas** | `marcadorPrecoAusente` |

Os dois primeiros ecoam ou derivam de **uma fonte só**, e cada um pode decidir sozinho olhando a leitura correspondente. Os dois últimos são o preço aplicável — o resultado da precedência inteira — e por isso dependem de que **ambas** as leituras tenham concluído: um contrato lido não basta se a cascata que resolveria o preço na ausência dele ainda não foi consultada, e vice-versa.

Antes deste conserto, "Valor do imóvel" e "Preço final" olhavam só a leitura de `imovel_dados` e ignoravam a do contexto — com o contrato lido e a cascata **falha**, os dois mostravam `—` ("não tem preço") quando o certo era `…` ("não sei", porque a cascata pode ter pulado elos e o preço real ser outro). `marcadorPrecoAusente` (`comum/preco.ts`) existe para que essa combinação não seja decidida duas vezes de jeitos diferentes: é a mesma condição que libera `podeAfirmarSemPreco` — as duas leituras concluídas — reaproveitada como valor de exibição, para os dois KPIs cujo número é fruto das duas fontes.

## Descontos

Os campos `desconto_a_vista`, `desconto_6x`, `desconto_12x`, `desconto_lote_grande` e `lote_grande_m2` existem no schema desde o primeiro commit e **nunca apareceram em tela nenhuma** — API sem UI é feature invisível. Agora o painel mostra o preço por forma de pagamento quando a proposta traz percentuais.

Os descontos são acumulativos: o de lote grande soma-se ao da forma de pagamento, e só entra quando `area_efetiva >= lote_grande_m2`. Sem área conhecida, ele **não** é aplicado por suposição.

## Pisos — implementados, ainda não ligados

`respeitaPiso()` compara o preço com `preco_minimo_residencial` ou `preco_minimo_comercial_misto`, conforme a **família de uso** do imóvel. É **informativo, nunca bloqueio** (RN-06): negociar abaixo do piso é decisão de negócio.

A função está escrita e testada, mas **a tela ainda não a chama** — e agora o motivo é mais preciso que "o catálogo não existe".

O catálogo existe: `comum/catalogos.ts`, e o único uso conhecido já tem família — **`CSIIR`** (*Comercial, Serviços, Industrial, Institucional e Residencial*) é uso misto, e vai para **`comercial_misto`**.

Que a sigla termine em "Residencial" não a torna residencial: uso misto admite residência entre outros usos, e o piso aplicável é o do conjunto. A família foi respondida por quem define o piso, não derivada da leitura da sigla — e é assim que tem de ser, porque a sigla sugere o contrário.

O que ainda falta para ligar a checagem na tela é o **dado**: `uso` não tem onde morar (#19/#20/#21 paradas, porque o destino é o Lote do Núcleo e o campo ainda não chegou lá). Sem `uso` no imóvel, não há o que passar para `familiaDoUso()`.

### O `null` da família é perigoso, e por isso é visível

`respeitaPiso(preco, proposta, null)` devolve `{ piso: null, abaixoDoPiso: false }`. Na tela, isso é **indistinguível de "respeita o piso"**. Ou seja: uso sem família não deixa a checagem imprecisa — deixa a checagem **desligada, com cara de aprovação**.

Por isso `comum/catalogos.ts` expõe `usosSemFamilia()`, que lista os usos presentes no dado cuja família não é conhecida (tanto os fora do catálogo quanto os que estão nele com `familia: null`). Quando a tela de piso for ligada, é ela que permite dizer *"o piso não foi conferido para estes imóveis"* em vez de deixar passar em silêncio.

É o mesmo princípio de `tiposDesconhecidos` em `transacoes-contrato.ts`: o descarte é legítimo, o silêncio não.
