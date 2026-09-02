---
titulo: Leitura do Núcleo
descricao: Por que toda leitura do Núcleo passa por um cliente próprio — paginação em laço, cache de sessão e o que fazer quando a flag está desligada.
tipo:
---

# Leitura do Núcleo

> O reg360 lê muito do Núcleo e escreve quase nada nele. Três restrições da plataforma decidem como essa leitura é feita, e nenhuma delas é evidente pelo código de tela.
>
> **Reconferidas em 2026-09-02 contra o `@urbiverso/sdk` 52.0.0** — o bundle publicado, não o `main` do monorepo. As quatro continuam valendo: `HelperNucleoApp` expõe exatamente `batch`, `chamarSubrecurso`, `atualizar` e `buscarPorChave`; não há rota de pessoa → imóveis; a listagem de pessoas não expande contatos; e a allowlist de filtros segue por entidade (`glebas`, por exemplo, só filtra por `matricula_id`). Refaça a conferência a cada nível novo de SDK — um contorno que perdeu a razão de existir vira dívida calada.

## As três restrições

**1. O backend não lê o Núcleo.** `req.nucleo` expõe `batch`, `chamarSubrecurso` (POST), `atualizar` (PATCH) e `buscarPorChave` — **não há `listar` nem `buscar` genérico**. Isso não é omissão a contornar: é o contrato. A consequência prática é que toda agregação que a tela mostra — contagem de lotes, soma de área, e mais adiante o VGV — é calculada **no cliente**, sobre dados que o próprio frontend buscou.

**2. O Núcleo pagina em 200 e não tem `varrerTudo`.** O framework de dados tem varredura pronta; o Núcleo não. Quem precisa do conjunto inteiro pagina em laço até a página vir incompleta. Com ~6.200 lotes na instância, uma varredura são 32 requisições.

**3. Flag desligada é `403`, não lista vazia.** O gate de flags do Núcleo recusa o acesso com dois códigos distintos, e tratá-los como erro genérico faz a tela dizer "nenhum registro" quando o problema é permissão.

**4. Filtro fora da allowlist é ignorado em silêncio — e devolve dado A MAIS.** Ver a seção própria abaixo. É a restrição que mais engana, porque a intuição espera o contrário.

## O cliente

`frontend/nucleo-cliente.ts` é a única porta de leitura. Tela nenhuma chama `urbiVerso.nucleo` direto — fazer isso perde as três coisas abaixo de uma vez.

| Função | Para quê |
|---|---|
| `listarTudo(recurso, filtros)` | Conjunto inteiro, paginando em laço. Use quando precisa agregar. |
| `listarPagina(recurso, filtros, pagina)` | Uma página. Use em tabela que pagina na tela. |
| `buscar(recurso, id)` | Detalhe. |
| `invalidar(recurso?)` | Descarta o cache depois de uma escrita. |
| `falhaDeFlag(erro)` | Distingue os dois `403` de flag de um erro qualquer. |

A decisão de **quando parar** a varredura mora separada, em `comum/paginacao.ts`, sem dependência de `fetch`, Lit ou Express — é lógica pura, coberta por teste. São quatro sinais de fim, porque nem todo endpoint do Núcleo preenche os mesmos metadados:

1. página vazia;
2. `pagina >= paginas`;
3. `total` conhecido e já acumulado;
4. página incompleta — menos linhas que `por_pagina`.

Há ainda um **teto de 200 páginas** como guarda: se o servidor devolver páginas cheias para sempre (bug, ou filtro que o Núcleo ignora silenciosamente por não estar na allowlist), a varredura para em vez de rodar até o navegador morrer.

## O que o Núcleo aceita como filtro

No Núcleo, `lerFiltrosExatos` itera sobre a **allowlist da entidade**, não sobre a query string:

```ts
for (const campo of camposFiltro) {
  const bruto = query[campo];
  if (bruto === undefined) continue;
```

Um parâmetro fora da allowlist **nunca chega ao SQL**. Não há erro, não há aviso — a listagem simplesmente volta *sem aquele recorte*.

**A consequência inverte a intuição:** filtro ignorado devolve **mais** linhas, nunca menos. Ignorar um recorte só pode aumentar o resultado. Então o sintoma de filtro ignorado **não é tela vazia** — é tela cheia de dado que não é do recorte pedido, com cara de resposta certa. Se uma lista voltou vazia, a causa é outra: o filtro foi honrado e não casou, `removido=excluir` escondeu linhas, a página passou do total, ou a app engoliu um `403`.

Foi assim que a v0.1.1 pediu `unidades?parcelamento_id=N` — filtro que não existe — e teria mostrado as unidades da instância inteira como se fossem daquele parcelamento.

A tabela vive em `comum/nucleo-filtros.ts`, **com a data em que foi conferida e contra o quê**. É retrato de um instante: se o Núcleo mudar, ela mente até alguém reconferir.

**Reconfira contra o SDK publicado** (`node_modules/@urbiverso/sdk/docs/nucleo.md` § Filtros de igualdade exata), nunca contra as rotas do Núcleo no `main` do monorepo. A conferência de 2026-08-29 usou o monorepo; os valores coincidiram, mas o método estava errado — o `main` está sempre à frente do que foi cunhado, então uma tabela conferida por ali descreve um Núcleo que a instância pode não estar rodando.

**Um caso o contrato publicado não responde:** `pessoas`. A doc do SDK lista os filtros de `lotes`, `glebas`, `unidades` e `parcelamentos` — entidades da fábrica de handlers —, e a rota de pessoas é escrita à mão, fora dela. O `tipo` que a tela de Moradores usa fica sem confirmação documental, e quem cobre isso é a **segunda guarda**: `linhasForaDoFiltro` confere o `tipo` de cada linha que voltou, e o Núcleo entrega `tipo` no payload como discriminador de supertipo. Se o filtro passar a ser ignorado, a tela quebra alto com `ErroDeFiltro` em vez de listar pessoa jurídica em silêncio.

É por isso que as duas guardas existem: a allowlist barra o que sabemos que não funciona; a conferência da linha pega o que não temos como saber.

| Recurso | Filtros de igualdade aceitos |
|---|---|
| `parcelamentos` | `setor_habitacional_id` (o único) |
| `lotes` | `parcelamento_id`, `incorporacao_id`, `matricula_id` |
| `unidades` | `incorporacao_id`, `matricula_id` — **não** `parcelamento_id` |
| `glebas` | `matricula_id` |
| `setores-habitacionais`, `matriculas`, `incorporacoes` | nenhum |
| `pessoas` | `tipo` |

`pagina`, `por_pagina`, `busca` e `removido` valem em qualquer recurso e não são recorte por coluna — `busca` é ILIKE sobre os `camposBusca` da entidade (em `lotes`: `numero_lote`, `quadra`, `conjunto`, `rua`).

O cliente aplica **duas guardas**, e as duas falham alto em vez de devolver dado plausível:

1. **Antes de sair** — `conferirFiltros` recusa filtro que o recurso não honra. Recurso ausente da tabela também é recusado: sem allowlist não dá para afirmar que o Núcleo obedece.
2. **Na volta** — `linhasForaDoFiltro` confere que as linhas devolvidas casam com o recorte pedido, para os campos que vêm no payload. É a guarda contra a allowlist ter mudado do outro lado sem esta tabela acompanhar.

Há ainda `linhasDaPagina`, que recusa envelope sem a lista `dados`. Antes era `resposta?.dados || []`, que tratava resposta de forma desconhecida como **vazia** — se o Núcleo trocasse o envelope, a app diria "não tem dado" em vez de "não entendi a resposta".

É a mesma ideia do `casaComChave` do importador (`scripts/importar-planilhao.mjs`), agora do lado da leitura.

## Cache

O cache guarda a **promessa**, não o resultado — duas telas que pedem o mesmo conjunto ao mesmo tempo compartilham uma requisição em vez de disparar duas. Promessa rejeitada é removida, para que um erro transitório não fique memorizado pela sessão inteira.

A chave é `(recurso, filtros)` com as chaves ordenadas, e filtro vazio é descartado: `{ busca: '' }` e `{}` são o mesmo conjunto, porque nenhum dos dois vira query string.

**Depois de qualquer escrita que afete um recurso, chame `invalidar(recurso)`.** Sem isso a tela continua mostrando o estado anterior pelo resto da sessão.

## Carregamento progressivo

A home mostra os setores com a contagem de parcelamentos **imediatamente** (são uma página cada: 6 setores, 60 parcelamentos) e dispara a varredura de lotes em segundo plano.

**A contagem tem três estados, não dois** (`estadoDaContagem`, em `comum/agregados.ts`):

| Estado | O rótulo |
|---|---|
| `correndo` | `contando lotes…` |
| `falhou` | `contagem indisponível` |
| `concluida` | o número |

`0 lotes` é resposta legítima **só depois de uma varredura que terminou bem**. Enquanto ela corre, seria mentira — e **depois de ela falhar, também**: o mapa fica vazio, a flag de "correndo" volta a `false`, e sem o terceiro estado a tela passaria a afirmar zero com a mesma cara com que afirmaria um número apurado.

Esse segundo caso já mordeu: a guarda original olhava só para "está correndo", então cobria a janela do carregamento e não a da falha. O painel de VGV logo abaixo, no mesmo card, já distinguia *"Calculando"* de *"indisponível"* — a contagem tinha ficado para trás.

**A área somada dos lotes herda os mesmos três estados**, porque sai do mesmo mapa. Sem isso, a varredura que falha mostraria `Área dos lotes: 0` ao lado de `contagem indisponível` — dois números da mesma fonte, um dizendo que não sabe e o outro afirmando zero.

Depois da primeira varredura, o cache serve o resto da sessão: voltar para a home não repete as 32 requisições.

**A carga da view tem os mesmos três estados**, e por um motivo próprio: ela é **sequencial**. Na home, `setores` carrega antes de `parcelamentos` — se o segundo falha, o primeiro já está populado e a tela renderiza os cards, cada um contando sobre uma lista vazia. Sem a marca `cargaFalhou`, eles diriam "0 parcelamentos" com apenas um banner genérico a contradizê-los.

`erro` e `cargaFalhou` são coisas diferentes de propósito: o primeiro alimenta o banner, o segundo impede a tela de **afirmar** sobre uma base que ela não leu. Um banner acima não desfaz uma frase abaixo.

**A troca de rota zera o alvo antes de carregar o novo.** `this.rota` muda e só depois a carga corre; sem o reset síncrono no topo de `_carregar()`, a janela entre o clique e a resposta renderiza o cabeçalho, os KPIs, o preço e as propostas do **objeto anterior**, sob o nome do novo. É a única classe de defeito desta família que não exibe ausência — exibe **o dado de outra coisa**, com a mesma confiança. São zerados: `detalhe`, `propostas`, `vigente`, `dadosDoImovel`, `paiDoImovel`, `unidadesDoLote`, `avisoHerancaUnidade`, `loteDaUnidade` e os três estados de leitura do imóvel — a lista é fechada porque cada item que fica de fora é um dado do objeto anterior sobrevivendo sob o nome do novo.

**A mesma janela, sem resposta, agora vira estado — não spinner eterno.** Os cinco renders de detalhe (Setor, Parcelamento, Imóvel, Morador, Proposta) caem em `_renderEsperaDetalhe()` enquanto `this.detalhe` é `null`, e antes deste PR isso significava só uma coisa: `<urbi-loading>`. Mas `_carregar()` zera `detalhe` tanto na carga que vai dar certo quanto na que vai **falhar**, e `cargaFalhou` já estava marcado quando a falha acontecia — só que nada olhava para ele nesse ponto. `_renderEsperaDetalhe()` agora distingue os dois casos que cabem em "ainda não tenho o objeto":

| `this.detalhe` | `cargaFalhou` | O que aparece |
|---|---|---|
| presente | — | o detalhe normal |
| `null` | `false` | `<urbi-loading>` — carregando de verdade |
| `null` | `true` | `<urbi-estado-vazio>` "Não foi possível carregar este item", com aviso de que o que aparecia antes não é mais confiável |

Sem essa distinção, uma falha na troca de rota — a mesma janela que este parágrafo descreve acima — girava para sempre: o `detalhe` zerado nunca voltava a ficar presente, e nada dizia ao spinner para parar.

**A lista da tela de Lotes tem um caso pior que o vazio: o cheio.** Quando a busca falha, os resultados da busca **anterior** continuam na tabela, agora sob o termo novo, com a paginação do total velho por baixo. Apagá-los perderia o que já foi lido; o que não pode é deixá-los se passarem pela resposta que não veio. A tela agora diz, num banner, que a tabela é o resultado anterior.

## Quando a flag está desligada

Os dois `403` do gate têm causas opostas e remédios diferentes:

| Código | Causa | Quem resolve |
|---|---|---|
| `NUCLEO_FLAG_DESLIGADA` | O admin da instância não ligou o toggle | Operação — `Admin → Apps → reg360 → Núcleo` |
| `NUCLEO_FLAG_NAO_PEDIDA` | O manifesto da app não declara a flag | Desenvolvimento — corrigir o `manifesto.json` |

A tela renderiza um `urbi-banner` que nomeia o caso e diz o próximo passo. A mensagem do próprio Núcleo já identifica a entidade e a flag que falta, então ela é exibida como veio — a app não reescreve.

Quais flags o app pede, e quem exige cada uma, está em [operacao.md](operacao#checklist-de-ativação-admin-da-instância).

## Busca: no cliente, não no Núcleo

A lista de Parcelamentos filtra **no cliente**, e isso é decisão, não atalho.

Os 60 parcelamentos já estão em memória — o cliente varre e memoriza o conjunto inteiro. Ir ao servidor a cada tecla desfaria o cache e daria uma resposta mais lenta. E menos tolerante: o `busca` do Núcleo é `ILIKE` sobre as colunas, então **não cruza acento** — quem digita `por do sol` não acharia `Pôr do Sol`.

`comum/busca.ts` normaliza tirando acento e caixa (`NFD` + remoção de diacrítico), e é testado com os nomes reais da instância.

A regra geral continua valendo ao contrário: **quando o conjunto não cabe em memória, o filtro é do Núcleo**. A tabela de Lotes de um parcelamento grande pagina e filtra no servidor; a lista de 60 parcelamentos, não.

## Dois custos que o Núcleo impõe, e não dá para contornar

Ambos vêm da mesma raiz: o Núcleo não oferece **leitura em lote por lista de ids**, e a app não pode mudar isso — o monorepo é somente leitura para este trabalho.

**Matrícula na tabela de Lotes.** O payload do lote traz `matricula_id` e `area_matricula`, mas **não** o número da matrícula. E `GET /matriculas` não aceita filtro por id (só `busca` por `numero`/`cri`/`uf`), então não dá para pedir "as 38 matrículas deste parcelamento". Ou se varre o conjunto inteiro uma vez e memoriza, ou se faz uma requisição por lote. A varredura ganha: ~25 requisições pagas uma vez por sessão, contra centenas.

A varredura memorizada tem o mesmo problema de fundo que o resto desta família: quando ela falha, `rotuloReferencia` sozinho devolve `…` para toda linha — e `…` que nunca vira `—` nem o número é limbo, não estado. O `…` aqui **não** significa "não tem matrícula" (isso é `—`, quando `matricula_id` é `null`); significa "não consegui achar o número desta referência", porque o mapa que resolveria o id nunca chegou a existir. Sem marca própria, essas duas causas do mesmo `…` ficam indistinguíveis, e o usuário não sabe se espera ou se recarrega.

Por isso `leituraMatriculas` (`EstadoContagem`) acompanha o cache: `correndo` até a varredura terminar, `falhou` se ela estourar, `concluida` — inclusive quando o cache já estava quente e a chamada nem saiu de novo, porque o cache é por **sessão**, não por imóvel, e um `correndo` perpétuo ali mentiria a cada nova tela. Quando falha, aparece um `urbi-banner` de erro com "Tentar de novo" — no rodapé da tabela de lotes do Parcelamento, e no detalhe do Imóvel quando aquele lote específico tem `matricula_id` — dizendo explicitamente que o `…` ali é referência não resolvida, não ausência: confundir os dois faria alguém concluir "este lote não tem matrícula" de um lote que tem.

**Ocupantes na tabela de Lotes.** `imovel_pessoas` só é alcançável em `GET /lotes/:id/pessoas` — não há expansão de vínculo na listagem de lotes, nem na de imóveis, nem na de pessoas. Mostrar quem ocupa cada lote custa **uma requisição por linha**.

Daí duas decisões da tela:

- A tabela pagina em **25 linhas**, pequeno de propósito: o tamanho da página é o número de requisições por virada.
- As requisições saem numa **janela de 6 simultâneas** (`comum/concorrencia.ts`), não de uma vez — 25 em paralelo estouram o limite de conexões do navegador e enfileiram de forma imprevisível.

E daí a busca por morador ser um **modo explícito**, não inferido do que se digita: ela exige carregar os ocupantes de todo o parcelamento. O usuário escolhe pagar esse custo; a tela não o cobra por conta própria.

## O que não fazer

- **Não chame `urbiVerso.nucleo` de dentro de uma tela.** Perde cache, paginação e o tratamento de flag.
- **Não reimplemente parsing de erro.** O shell já normaliza `status`, `codigo` e `mensagem`.
- **Não reimplemente `id_legivel`, `cpf_formatado`, `telefone_formatado` nem `area_efetiva`.** O Núcleo entrega tudo pronto no payload; remontar cria uma segunda verdade.
