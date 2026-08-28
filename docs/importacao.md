---
titulo: Importação do Planilhão
descricao: Mapeamento Planilhão → Núcleo e app, e as três armadilhas que fazem uma importação errada parecer bem-sucedida.
tipo:
---

# Importação de dados do Planilhão

> **Isto não é carga inicial em base vazia.** A instância já tem 60 parcelamentos, ~6.233 lotes, ~2.873 pessoas e ~4.808 matrículas. É importação **incremental sobre dado vivo**, que é o caso difícil — e é por isso que a simulação é o padrão e a escrita exige `--executar`.

Fonte única: o **Planilhão** (~6.000 linhas). O Airtable legado não é usado.

## Três armadilhas que fazem um import errado parecer certo

Nenhuma das três dá erro. É por isso que estão no topo deste doc.

### 1. Filtro que o Núcleo ignora em silêncio

O Núcleo **descarta filtro fora da allowlist sem rejeitar**. Então `GET /lotes?quadra=B&numero_lote=1` pode devolver a instância inteira, e `dados[0]` seria um lote qualquer — que o upsert trataria como "já existe".

O efeito seria mudo e catastrófico: milhares de lotes não criados, matrícula pendurada no imóvel errado, e um relatório dizendo *"0 criados, tudo já existia"*.

Por isso o script **não confia no filtro: confere o que voltou** (`casaComChave`). Se o registro devolvido não bate com a chave pedida, a importação **para** — importar sobre premissa falsa é pior que não importar.

### 2. `pessoas/fisicas` leva barra, não hífen

Os recursos do Núcleo usam hífen (`setores-habitacionais`), e a versão anterior do script generalizou isso para pessoas. Mas no Núcleo o caminho é **`/pessoas/fisicas`** — com barra, para o Express não resolver como `/pessoas/:id` com `id='fisicas'`.

Resultado: **todo upsert de morador tomava 404**, e nenhuma pessoa era importada. Numa importação em lote, 404 numa linha parece dado ruim, não rota errada.

### 3. Área vazia virando zero

`Number('')` é `0`. A versão anterior deixava passar, e lote sem área registrada entrava com `area: 0`.

Não é detalhe: no Núcleo, **`area` nula é o sinal de que a área vem da matrícula**, e é dele que o agregado tira a dedupe de matrícula-mãe compartilhada. Com `area: 0` o lote passa a ter "área própria", a dedupe não acontece, e a área da matrícula é somada uma vez por lote irmão — inflando o total do parcelamento.

Um zero importado aqui reintroduz, **pelo dado**, o defeito que o agregado conserta no código.

### 4. Ponto que é decimal, apagado como se fosse milhar

`161.10` virava **16110**. A conversão apagava todo ponto antes de converter, tratando-o sempre como separador de milhar — e o preço é **gravação única**, então um valor inflado assim só se corrige pela rota de admin.

O separador agora é decidido pelo texto:

| Entrada | Leitura | Por quê |
|---|---|---|
| `1.234,56` | 1234,56 | tem vírgula → ela é o decimal, ponto é milhar |
| `1.234.567` | 1234567 | mais de um ponto → todos milhar |
| `161.10` | 161,10 | um ponto, 1–2 casas → decimal |
| `1.234` | **ambíguo** | 1234 em pt-BR, 1,234 em inglês — o texto não diz |

**O ambíguo não é chutado.** A linha vai para o relatório e o campo fica sem valor. Chutar grava número errado num campo que não se desfaz — e área errada é o que mais mente no VGV.

## Mapeamento

| Planilhão | Destino | Chave de upsert |
|---|---|---|
| Setor | `nucleo.setores_habitacionais` | `slug` — **deve pré-existir** (o app é read-only em setores) |
| PAR | `nucleo.parcelamentos` | `slug` |
| Matrícula | `nucleo.matriculas` | `numero` |
| QD, CJ, LT, Endereço, Área | `nucleo.lotes` | `(parcelamento_id, quadra, conjunto, numero_lote)` |
| Morador, CPF | `nucleo.pessoas_fisicas` | `cpf` |
| (ocupação morador↔lote) | `nucleo.imovel_pessoas` | `POST /lotes/:id/pessoas` |
| Nº Decreto | `reg360.parcelamento_dados` | `parcelamento_id` |
| Preço | `reg360.imovel_dados.preco_estatico` | **gravação única** — ver abaixo |
| Uso, Tipo Lote | — | **não gravado**; vai para o relatório (ver abaixo) |
| Status (Contratado / CP / Vendido) | — | **não gravado**; relatório de pendências |

**O objeto é o LOTE, não a unidade.** A premissa da spec v0.9 de que todo lote gera uma unidade default nunca virou realidade: `unidades.incorporacao_id` é NOT NULL, então unidade só existe sob incorporação.

## Preço: gravação única, divergência reportada

`preco_estatico` é o registro de um contrato firmado. Se o imóvel **já tem** preço gravado, o script **não sobrescreve** — a rota devolve `409` e a linha vira uma entrada em *Divergências de preço*.

O script não decide qual valor vale. Ele mostra os dois e deixa a decisão com quem sabe. Ver [precos.md](precos).

## O que não é importado, e por quê

**Uso e Tipo de Lote.** O catálogo (#22) não fechou, e a decisão é que esses campos vão morar no objeto **Lote do Núcleo**, não numa tabela do app. Gravá-los agora criaria uma segunda fonte da verdade para o mesmo dado. As linhas vão para o relatório.

**Transação.** A entidade não existe no Núcleo (#36). Linhas com status comercial vão para o relatório de pendências, em vez de sumir: descartar em silêncio faria o import parecer completo e deixaria o dado comercial para trás sem ninguém saber.

## Pré-requisitos

1. **Setores Habitacionais criados** no Núcleo (via `editor_nucleo`) — o app é read-only neles.
2. **Flags de Núcleo habilitadas** em `Admin → Apps → reg360 → Núcleo`: escrever em `parcelamentos`, `matriculas`, `imoveis`, `pessoas`.
3. **Token de API** de usuário com nível `escrita`+ no reg360 e os roles `criador` e `editor_regularizacao` — o primeiro grava preço, o segundo grava o decreto.
4. Planilhão exportado para **CSV UTF-8**.

## Procedimento

```bash
# 1. SIMULAÇÃO — o padrão. Não escreve nada.
URBI_BASE=https://homolog.urbiverso.com.br URBI_TOKEN=<token> \
  node scripts/importar-planilhao.mjs planilhao.csv

# 2. Execução real, depois de ler o relatório inteiro.
URBI_BASE=https://homolog.urbiverso.com.br URBI_TOKEN=<token> \
  node scripts/importar-planilhao.mjs planilhao.csv --executar
```

O modo seguro é o que se obtém **por engano**: rodar sem flag nenhuma não escreve. `--simular` é aceito como sinônimo, porque é como a issue #38 nomeia o modo.

**Sempre na instância intermediária** (Pinguim), nunca na de desenvolvimento — ver [operacao.md](operacao).

Antes do primeiro import, ajuste `COLUNAS` no topo do script com os cabeçalhos reais do Planilhão.

## O relatório

Import que só diz "ok" esconde o que não entrou. O relatório sai por categoria:

- **Criados** / **Atualizados** / **Ignorados (já existiam)** — por tipo de entidade
- **Divergências de preço** — preço de contrato já gravado, não sobrescrito
- **Transações pendentes** — linhas com status comercial
- **Uso / Tipo de Lote pendentes** — aguardando o catálogo
- **Erros** — por linha, com o número da linha do CSV

Código de saída: `0` limpo, `2` com erros de linha, `3` interrompido (filtro ignorado — ver armadilha 1).

## Idempotência

Reprocessar a mesma planilha não duplica: o upsert é por chave natural e a existência é **conferida**, não presumida. Reexecuções cobrem correções e importações incrementais.

## Conferência

Depois do import, navegue Setor → Parcelamento → Lote e confira contagens e áreas contra o relatório. O VGV do parcelamento é um bom detector de área importada errada: se a "Área somada dos lotes" saltar, olhe `areasDeduplicadas` — ver [vgv.md](vgv).
