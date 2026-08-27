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

## O que não fazer

- **Não chame `urbiVerso.nucleo` de dentro de uma tela.** Perde cache, paginação e o tratamento de flag.
- **Não reimplemente parsing de erro.** O shell já normaliza `status`, `codigo` e `mensagem`.
- **Não reimplemente `id_legivel`, `cpf_formatado`, `telefone_formatado` nem `area_efetiva`.** O Núcleo entrega tudo pronto no payload; remontar cria uma segunda verdade.
