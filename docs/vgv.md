---
titulo: VGV e agregados
descricao: Como o VGV é calculado, por que ele é potencial, e o que o número deixa de fora.
tipo:
---

# VGV e agregados

> O VGV é o número mais visível do app. Também é o mais fácil de mentir sem querer.

## É potencial, não realizado

```
VGV = Σ (preço aplicável do lote × area_efetiva)
```

Todos os lotes entram, tenham contrato ou não. Confere com a tela do legado: **Bianca** tem VGV de R$ 6.819.857,60 com **5,26% de adesão** — se fosse soma de contratos assinados, o número seria uma fração disso.

O preço de cada lote sai da mesma precedência do painel de preços (ver [precos.md](precos)): contrato gravado → preço manual → proposta vigente, resolvida em cascata `Lote → Parcelamento → Setor`.

## O número diz sobre quantos lotes ele foi feito

Um VGV que ignora silenciosamente parte dos lotes é **pior que nenhum VGV**: parece completo e não é. Por isso o agregado devolve, junto com o valor:

- `comValor` — quantos entraram;
- `semPreco` — quantos ficaram fora por não ter preço em nenhum dos três níveis;
- `semArea` — quantos ficaram fora por não ter área.

E a tela escreve isso: *"VGV sobre 1.180 de 1.220 lotes — 38 sem preço, 2 sem área"*.

**Preço zero entra.** Zero é valor, não ausência. Só `null` fica de fora.

## Matrícula-mãe compartilhada não infla a área

`imoveis.matricula_id` **não é unique** — uma matrícula pode cobrir vários imóveis (gleba ainda não desmembrada, por exemplo). Quando o lote não tem área própria, o Núcleo devolve a área **da matrícula** em `area_efetiva`; somar isso para cada lote irmão multiplica a área do conjunto.

O agregado conta a área herdada de uma mesma matrícula **uma vez só**, e informa quantos lotes caíram nesse caso. Área **própria** nunca é deduplicada, mesmo com matrícula repetida — ali somar está certo.

O VGV continua somando por imóvel, porque preço é por imóvel: a dedupe é só da área.

**E a dedupe atravessa parcelamentos.** Uma matrícula-mãe pode cobrir lotes de dois parcelamentos do mesmo Setor. Se cada agregado guardasse só o total já deduplicado, somá-los no Setor recontaria a área — e o número inflado não teria como se denunciar, porque um escalar não carrega a identidade da matrícula. Por isso o agregado leva `areaPorMatricula` junto, e `somarAgregados` **une os mapas** em vez de somar áreas: a repetição entre parcelamentos entra em `areasDeduplicadas` como qualquer outra.

`areaTotal` é sempre `areaPropria + Σ (área herdada, uma por matrícula)`.

## Área privativa ainda não existe

Separar área privativa de comum exige saber o **uso** de cada lote, que vem do catálogo da issue #22. Enquanto ele não existir, o campo devolve `null` e a tela mostra `—` com a explicação — em vez de um número que parece certo e não é.

## Onde a conta roda, e por quê

No **cliente**. Não é escolha: `req.nucleo` não lê no backend (ver [leitura-nucleo.md](leitura-nucleo)), então quem tem os lotes em mãos é o frontend.

São três varreduras, cada uma memorizada por sessão:

| Base | Origem | Volume |
|---|---|---|
| Lotes | Núcleo, paginado | ~6.200 |
| Propostas | tabela do app | poucas |
| Preços por imóvel | tabela do app | um por imóvel editado |

Com elas em memória, o agregado de qualquer parcelamento ou setor é conta local — os 60 cards da lista não disparam 60 requisições.

**Enquanto as bases não estão em memória, a tela não mostra número.** VGV calculado sobre base vazia dá exatamente R$ 0,00 com "todos sem preço" — indistinguível de um parcelamento que de fato não tem preço nenhum. Então o painel diz *"calculando"* enquanto carrega, e *"VGV indisponível"* se a carga falhou. As duas frases são melhores que um zero com cara de resposta.

Isso vale para **toda** entrada na tela, inclusive abrir `/parcelamento/:id` direto ou dar reload nela: o ramo carrega as bases, e o elo de Setor da cascata sai do próprio detalhe (que já traz `setor_habitacional_id`), sem buscar a lista de parcelamentos.

**Gravar preço ou aprovar proposta invalida as bases**, que recarregam na hora. Sem isso os cards e KPIs continuariam exibindo o valor anterior até um reload da página — o tipo de erro que ninguém reporta porque parece que "ainda não atualizou".

### A varredura de propostas depende da rota repassar a paginação

`listarTodasPropostas` pagina em laço sobre `GET /propostas`. A rota **aceita `pagina` e `por_pagina`** — e precisa aceitar: enquanto ela os ignorava, o cliente pedia a página 2 e recebia sempre a primeira, o acumulado enchia de duplicatas e as propostas do fim nunca chegavam. Nada estourava; só o VGV saía errado.

A resposta **não inventa `por_pagina`**. Ecoar o valor pedido quando o framework entrega menos faria a varredura ler "página incompleta = última" logo na primeira página e truncar em silêncio — o defeito espelhado. A parada fica por conta de `paginas`/`total`, e no pior caso custa uma requisição vazia a mais.

A lógica é pura e testada em `comum/agregados.ts`: `indexarPropostas`, `vigentePorCascata`, `agregarImoveis`, `somarAgregados`. O Setor **soma os agregados dos parcelamentos**, sem revarrer os lotes.
