---
titulo: Leitura do Núcleo
descricao: Por que toda leitura do Núcleo passa por um cliente próprio — paginação em laço, cache de sessão e o que fazer quando a flag está desligada.
tipo:
---

# Leitura do Núcleo

> O reg360 lê muito do Núcleo e escreve quase nada nele. Três restrições da plataforma decidem como essa leitura é feita, e nenhuma delas é evidente pelo código de tela.

## As três restrições

**1. O backend não lê o Núcleo.** `req.nucleo` expõe `batch`, `chamarSubrecurso` (POST), `atualizar` (PATCH) e `buscarPorChave` — **não há `listar` nem `buscar` genérico**. Isso não é omissão a contornar: é o contrato. A consequência prática é que toda agregação que a tela mostra — contagem de lotes, soma de área, e mais adiante o VGV — é calculada **no cliente**, sobre dados que o próprio frontend buscou.

**2. O Núcleo pagina em 200 e não tem `varrerTudo`.** O framework de dados tem varredura pronta; o Núcleo não. Quem precisa do conjunto inteiro pagina em laço até a página vir incompleta. Com ~6.200 lotes na instância, uma varredura são 32 requisições.

**3. Flag desligada é `403`, não lista vazia.** O gate de flags do Núcleo recusa o acesso com dois códigos distintos, e tratá-los como erro genérico faz a tela dizer "nenhum registro" quando o problema é permissão.

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

## Cache

O cache guarda a **promessa**, não o resultado — duas telas que pedem o mesmo conjunto ao mesmo tempo compartilham uma requisição em vez de disparar duas. Promessa rejeitada é removida, para que um erro transitório não fique memorizado pela sessão inteira.

A chave é `(recurso, filtros)` com as chaves ordenadas, e filtro vazio é descartado: `{ busca: '' }` e `{}` são o mesmo conjunto, porque nenhum dos dois vira query string.

**Depois de qualquer escrita que afete um recurso, chame `invalidar(recurso)`.** Sem isso a tela continua mostrando o estado anterior pelo resto da sessão.

## Carregamento progressivo

A home mostra os setores com a contagem de parcelamentos **imediatamente** (são uma página cada: 6 setores, 60 parcelamentos) e dispara a varredura de lotes em segundo plano. Enquanto ela não termina, o rótulo diz `contando lotes…` — nunca `0 lotes`, que seria mentira enquanto a conta ainda corre.

Depois da primeira varredura, o cache serve o resto da sessão: voltar para a home não repete as 32 requisições.

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

**Ocupantes na tabela de Lotes.** `imovel_pessoas` só é alcançável em `GET /lotes/:id/pessoas` — não há expansão de vínculo na listagem de lotes, nem na de imóveis, nem na de pessoas. Mostrar quem ocupa cada lote custa **uma requisição por linha**.

Daí duas decisões da tela:

- A tabela pagina em **25 linhas**, pequeno de propósito: o tamanho da página é o número de requisições por virada.
- As requisições saem numa **janela de 6 simultâneas** (`comum/concorrencia.ts`), não de uma vez — 25 em paralelo estouram o limite de conexões do navegador e enfileiram de forma imprevisível.

E daí a busca por morador ser um **modo explícito**, não inferido do que se digita: ela exige carregar os ocupantes de todo o parcelamento. O usuário escolhe pagar esse custo; a tela não o cobra por conta própria.

## O que não fazer

- **Não chame `urbiVerso.nucleo` de dentro de uma tela.** Perde cache, paginação e o tratamento de flag.
- **Não reimplemente parsing de erro.** O shell já normaliza `status`, `codigo` e `mensagem`.
- **Não reimplemente `id_legivel`, `cpf_formatado`, `telefone_formatado` nem `area_efetiva`.** O Núcleo entrega tudo pronto no payload; remontar cria uma segunda verdade.
