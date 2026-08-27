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

## Descontos

Os campos `desconto_a_vista`, `desconto_6x`, `desconto_12x`, `desconto_lote_grande` e `lote_grande_m2` existem no schema desde o primeiro commit e **nunca apareceram em tela nenhuma** — API sem UI é feature invisível. Agora o painel mostra o preço por forma de pagamento quando a proposta traz percentuais.

Os descontos são acumulativos: o de lote grande soma-se ao da forma de pagamento, e só entra quando `area_efetiva >= lote_grande_m2`. Sem área conhecida, ele **não** é aplicado por suposição.

## Pisos — implementados, ainda não ligados

`respeitaPiso()` compara o preço com `preco_minimo_residencial` ou `preco_minimo_comercial_misto`, conforme a **família de uso** do imóvel. É **informativo, nunca bloqueio** (RN-06): negociar abaixo do piso é decisão de negócio.

A função está escrita e testada, mas **a tela ainda não a chama**: a família vem do catálogo de Uso, que é a issue #22 e ainda não existe. Passando `null`, a checagem não roda — melhor não checar do que checar contra a família errada.
