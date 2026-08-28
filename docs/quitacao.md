---
titulo: Quitação do imóvel
descricao: Por que quitação é marca e não cálculo, quem pode registrá-la, e por que ela tem rota própria.
tipo:
---

# Quitação do imóvel

> "Quitar significa que qualquer representação financeira dele no fluxo já foi quitada." — e isso decide tudo sobre o desenho.

## É marca, não cálculo

O saldo devedor vive na base do financeiro, **fora do escopo do app**. O reg360 não calcula quitação: ele registra que alguém a **constatou**.

Daí a consequência prática: autoria e data andam sempre junto com a flag. Marca sem autoria não responde à única pergunta que alguém vai fazer depois — *"quem disse que estava quitado?"*.

E daí também: desmarcar **limpa autoria e data**. Deixá-las apontando para a marcação anterior faria a tela dizer "quitado por Fulano" sobre um imóvel que não está quitado.

## Quem pode: `validador_interno`, não `criador`

Quitação é constatação financeira, não cadastro. O perfil é o mesmo que aprova proposta.

`criador` cadastra dado; quem afirma que a dívida acabou precisa de alçada para isso. O botão nem aparece para quem não tem o gate — botão que a API vai recusar é pior que botão ausente.

## Rota própria, e uma guarda para que continue própria

```
POST /api/reg360/imovel-dados/:tipo/:id/quitar
POST /api/reg360/imovel-dados/:tipo/:id/desquitar
```

Separadas do `PUT` descritivo porque têm **gate diferente**. E, para que a separação não se desfaça sozinha, existe `CAMPOS_SO_POR_ROTA_PROPRIA` em `comum/quitacao.ts`: as rotas descritivas **recusam** um corpo que traga `quitado` ou `preco_estatico`.

Sem essa guarda, no dia em que entrar o PUT de `uso`/`tipo_lote` (issue #20), nada impediria o cliente de mandar `quitado: true` no mesmo corpo e pular o gate. A falha desse tipo de regra é **ausência**, não erro — por isso a guarda mora em `comum/`, onde a próxima rota de escrita a herda sem precisar lembrar dela.

A recusa é explícita, não descarte silencioso: cliente que manda `quitado` num PUT descritivo está enganado sobre a API, e uma resposta que ignora o campo o deixaria acreditar que gravou.

**A presença da chave é o que conta, não o valor.** `quitado: false` também é recusado — ele desmarcaria a quitação passando por baixo do gate.

## Idempotente de propósito

Marcar o que já está marcado devolve `{ ok: true, ja_quitado: true }`, não `409`. Repetir a ação não é conflito: é o mesmo desfecho, e um erro ali só faria a tela tratar problema que não existe.

## Desmarcar existe

Marca irreversível vira dado errado permanente no primeiro clique por engano — e ninguém confia numa marca que não dá para desfazer. O botão pede confirmação, dizendo que a data e o autor serão apagados.

## Filtro na tabela de lotes

Sem filtro, a flag não teria uso prático nenhum. Os chips **Todos / Quitados / Não quitados** usam a mesma base que o VGV já carrega (`imovel_dados` por imóvel), então não custam requisição nova — mas dependem dela: enquanto a base não chegou, a tela diz que está carregando em vez de filtrar sobre o vazio.

Lote **sem registro** conta como não quitado. É o caso normal: a maioria dos imóveis nunca foi editada.
