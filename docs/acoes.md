---
titulo: Ações judiciais
descricao: Como as ações sobre imóveis e pessoas são modeladas, por que o vínculo é N:N nos dois lados, e o que a tela mostra.
tipo:
---

# Ações judiciais

> Ações estavam **fora** do MVP da spec v0.9 ("Ações judiciais/extrajudiciais — v2"). Voltaram porque aparecem nas telas do legado, e porque saber que há litígio sobre um lote muda como se negocia esse lote.

## Sobre imóveis **e/ou** pessoas

Uma ação pode existir só contra uma pessoa, só sobre um imóvel, ou sobre vários dos dois. Daí os dois vínculos N:N — `acao_imoveis` e `acao_pessoas` — e daí a regra de que **ao menos um** precisa existir: ação sobre nada não é ação, e nasceria invisível em toda tela.

As três tabelas moram no schema do app, **sem relação com outros apps**. A referência aos objetos do Núcleo é lógica, por id, nunca FK.

## O polo é dado, não texto

Os títulos do legado carregam quem move contra quem:

> *Ação Revisional de B Lote 1 contra UP*
> *Ação de Obrigação de Fazer de UP contra B Lote 1*

`polo` (`up_contra` / `contra_up`) guarda isso, e `tituloAcao()` em `comum/acoes.ts` monta a frase. **Uma função só**, usada pelo card, pelo badge e por qualquer listagem — título montado em dois lugares diverge no dia em que um deles muda.

Sem alvo conhecido o título ainda diz o polo (`de a parte contrária contra UP`): menos informação, mas não informação errada.

## Cor por tipo, em mapa exato

`badgeAcao()` classifica por **igualdade**, nunca por `includes`. `'obrigacao_de_fazer'` contém `'obrigacao'`, e classificar por substring é exatamente como um status vira o badge do outro sem ninguém perceber — foi o defeito real de `badgeRegularizacao`, e o teste que o cobre está em `backend/__tests__/acoes.test.ts`.

Tipo desconhecido cai em `outra` em vez de quebrar a tela, porque **`tipo` é catálogo aberto por ora**: a lista completa nunca foi levantada, e `outra` + `descricao` é a válvula que evita uma migração a cada tipo novo que aparecer. Se o catálogo fechar, restringir.

## Só ação ativa vira badge no cabeçalho

Encerrada e suspensa continuam na aba — sumir da aba seria perder histórico —, mas destacá-las no topo diria que há litígio em curso onde não há.

## Criar é atômico

`POST /acoes` aceita `imoveis[]` e `pessoas[]` **no mesmo corpo** e grava tudo numa transação. Criar a ação e vincular depois, em chamadas separadas, deixa ação órfã quando a segunda falha: consistência multi-tabela é do endpoint, nunca do chamador.

Criar a partir do lote já vem com o lote vinculado — a tela não pede ao usuário que repita o que ela já sabe.

Remover é soft delete, e leva os vínculos junto: vínculo órfão apontando para ação removida reapareceria em qualquer contagem por imóvel ou por pessoa.

## Duas paginações, uma ordem

`GET /acoes` pagina de dois jeitos, e a diferença é imposta pelo framework: ele **não faz junção entre tabelas do app**, e o filtro por imóvel ou por pessoa mora na tabela de vínculo.

- **Sem filtro de vínculo** → a paginação é do banco. Pede-se a página e pronto.
- **Com filtro de vínculo** → acham-se os `acao_id` no vínculo, varre-se `acoes`, filtra-se e fatia-se em memória. Aí `total` e `paginas` são **calculados aqui**, não ecoados do banco: os do banco contariam as ações que o vínculo excluiu.

Os três caminhos (banco, filtrado, vazio) devolvem o **mesmo envelope** — `dados`, `total`, `pagina`, `por_pagina`, `paginas` —, montado numa função só. Repassar cru o que o framework devolve faria o mesmo cliente receber formatos diferentes ao pôr ou tirar um filtro de vínculo, e `por_pagina` sumiria quando o framework não o ecoa.

### A ordem é por `id`, e isso é deliberado

Ordenar por `data` — o que a tela quer — **não define a ordem entre empates**, e empate é comum: `data` é opcional, então várias ações ficam `null`. Com `LIMIT`/`OFFSET` diferentes o banco pode devolver as empatadas em posições distintas, e aí páginas **repetem ou omitem** registros, sem erro nenhum.

`id` é único, então a ordem é total. O custo é a lista sair por ordem de **cadastro**, não pela data do processo: uma ação registrada hoje com data de 2020 aparece no topo. É um preço barato — cada card mostra a sua data — perto de uma paginação que perde linhas. Ordem composta (`data DESC, id DESC`) resolveria os dois, mas o `ordenar` do SDK publicado recebe uma coluna.

### A varredura tem teto próprio, e falha em vez de truncar

`proximaPagina` carrega o teto de 200 páginas do **Núcleo** — guarda contra laço infinito, não limite de negócio. Reusá-lo na varredura das tabelas do app cortaria em silêncio um conjunto legítimo, e `total`/`paginas` passariam a mentir.

Por isso `varrer()` não usa `proximaPagina`: tem os seus próprios sinais de parada e um teto de 50.000 registros que, ao ser batido, devolve **`413 REG360_CONSULTA_GRANDE_DEMAIS`**. Erro explícito é melhor que meia resposta com cara de resposta inteira.

Buscar os vínculos de uma página tem o mesmo dilema — o framework não filtra por lista de ids. Até 10 ações vale uma requisição por ação, em janela de 6 simultâneos (`comum/concorrencia.ts`); acima disso, uma varredura só sai mais barata que a enxurrada. O detalhe de **uma** ação sempre filtra por `acao_id`, que é o índice da tabela.

## Filtro por imóvel exige os dois campos

`imovel_id` sozinho é `400`. Sem o tipo, o filtro devolveria as ações do **lote 5 e da unidade 5** — objetos diferentes com o mesmo número. Filtro pela metade é pior que filtro ausente: o resultado tem cara de certo.

Filtrar por imóvel **e** por pessoa ao mesmo tempo é interseção ("ações deste lote e desta pessoa"), não união.

## Rotas

| Rota | Gate |
|---|---|
| `GET /acoes` — filtros `imovel_id`+`imovel_tipo`, `pessoa_id`, `tipo`, `polo`, `status` | leitura livre |
| `GET /acoes/:id` — detalhe com vínculos | leitura livre |
| `POST /acoes` — criar com os vínculos juntos | `criador` |
| `PATCH /acoes/:id` | `criador` |
| `POST /acoes/:id/remover` | `criador` |
| `POST /acoes/:id/{imoveis,pessoas}` — vincular | `criador` |
| `POST /acoes/:id/{imoveis,pessoas}/:vinculoId/remover` | `criador` |

A leitura é livre de propósito: quem enxerga o lote precisa saber que há litígio sobre ele. Escrever é de `criador` ou do admin da app.

Desvincular confere que o vínculo é **daquela** ação. Sem essa checagem, quem conhece um id qualquer apaga vínculo de outra ação por uma URL montada à mão.

## Vincular pessoas pela tela

O formulário de ação tem um seletor de pessoas: busca no Núcleo, escolhidas viram cartões com o **papel** ao lado (`autor`, `réu`, `interessado`).

**A busca é no servidor, não em lista carregada.** São ~2.873 pessoas na instância; `GET /pessoas` filtra por `busca` (ILIKE sobre nome, CPF e id legível) e pagina. O campo espera **duas letras** antes de disparar e tem 350 ms de debounce — sem isso, cada tecla vira uma requisição ao Núcleo. Resposta que chega depois de o termo já ter mudado é descartada: sem essa guarda, a busca lenta de "ana" sobrescreveria o resultado já exibido de "ana maria".

**O papel é do vínculo, não da pessoa.** A mesma pessoa é ré numa ação e interessada em outra, por isso o seletor de papel fica no cartão do vínculo. Uma pessoa tem **um** papel por ação: `lerVinculosPessoa` deduplica por `pessoa_id`, então vincular a mesma pessoa duas vezes não daria erro — sumiria em silêncio. A tela impede antes, desabilitando o botão de quem já está na ação.

### Criar e editar seguem caminhos diferentes, e é o protocolo que manda

**Na criação**, os vínculos vão no mesmo corpo do `POST /acoes`, gravados numa transação só. Criar-e-vincular em duas chamadas deixaria ação órfã se a segunda falhasse.

**Na edição não existe corpo que aceite vínculo** — `acao_pessoas` só tem criar e remover. Então trocar o papel de alguém é, no protocolo, **remover o vínculo e criar outro**. Quem compara só o conjunto de `pessoa_id` conclui que "não mudou nada" e o papel novo nunca é gravado: a pessoa continua vinculada, e a falha é ausência, não erro.

Por isso o diff mora numa função pura e testada — `diffVinculosPessoa` em `comum/acoes.ts` —, que compara por `pessoa_id` **e** papel. A ordem que ela impõe também não é indiferente: **remover antes de adicionar**. Adicionar primeiro esbarraria no vínculo antigo, que a rota trata como idempotente e devolve intacto — e a troca de papel sumiria sem erro nenhum.

Consequência para quem usa: editando, nada é gravado antes do **Salvar**. O formulário guarda a intenção; o rodapé diz isso.

## Ações na tela da pessoa

O detalhe do morador tem uma seção **Ações**, alimentada por `GET /acoes?pessoa_id=`, com os mesmos cartões da aba do lote.

**O recorte é mais largo que o da aba do lote**: aqui entram também as ações **sem imóvel vinculado** — que são exatamente as que nenhuma tela de imóvel tem como mostrar.

O `alvo` do título muda: na aba do lote é o imóvel, aqui é o nome da pessoa. O título continua saindo de `tituloAcao` (`comum/acoes.ts`), que é a única montagem que existe — remontar a string na tela é como as duas divergem no dia em que uma delas muda.

**Mutação recarrega a lista do recorte aberto**, não sempre a do imóvel. Recarregar por imóvel na tela do morador não daria lista vazia: daria as ações do *imóvel de mesmo número* do id da pessoa.

## Lista vazia de ação: três causas, três frases

As duas telas de ação — a aba do imóvel e a seção da pessoa — terminam numa afirmação: *"Nenhuma ação neste imóvel"*, *"Nenhuma ação com esta pessoa"*. Ambas eram ditas também quando `GET /acoes` falhava: `carregandoAcoes` cobria a janela do carregamento, voltava a `false` no `catch`, e a lista vazia produzia a mesma frase de um imóvel que realmente não tem ação.

Hoje as duas passam por `estadoDaLista` (`comum/estado-lista.ts`), com os três estados. A submensagem da falha diz o que a tela **não** sabe — sem ela, *"não foi possível carregar"* sozinho ainda deixa o leitor concluir que provavelmente não havia nada.

Vale notar o que **não** mudou: o badge de ação em destaque no cabeçalho continua derivando de `this.acoes`, e some quando a lista está vazia. Isso é correto aqui e não é o caso do badge de transação — a diferença é que a carga de ações roda na mesma view, e a falha dela já aparece na aba logo abaixo, com frase própria.

## O que ainda não existe

**Criar ação a partir da pessoa.** O backend aceita — `POST /acoes` exige ao menos um imóvel **ou** uma pessoa —, mas a tela do morador só lista. Registrar continua sendo pela aba Ações do imóvel.

**Vincular outros imóveis pela tela.** A rota existe; o formulário não oferece o controle. Criando a partir do lote, o próprio lote já entra vinculado.

## Referência lógica que não resolve

O backend não lê o Núcleo, então não há como conferir se o `imovel_id` ou o `pessoa_id` existe antes de gravar. Um id que não resolve aparece **à mostra** (`#123`), em vez de sumir: vínculo invisível é pior que vínculo esquisito, porque ninguém o conserta.
