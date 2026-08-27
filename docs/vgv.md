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

A lógica é pura e testada em `comum/agregados.ts`: `indexarPropostas`, `vigentePorCascata`, `agregarImoveis`, `somarAgregados`. O Setor **soma os agregados dos parcelamentos**, sem revarrer os lotes.
