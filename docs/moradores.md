---
titulo: Moradores
descricao: A tela de pessoas, por que a coluna de imóveis depende de um recorte escolhido, e por que a situação tem três estados.
tipo:
---

# Moradores

> A tela parece simples — lista de pessoas com nome, CPF, contato e imóveis. Uma dessas colunas é impossível de preencher do jeito óbvio, e a decisão de como lidar com isso é o que este doc registra.

## O Núcleo não entrega pessoa → imóveis

O vínculo morador↔imóvel mora em `imovel_pessoas`, e o Núcleo o expõe **só pelo lado do imóvel**:

| O que existe | O que **não** existe |
|---|---|
| `GET /lotes/:id/pessoas` (e o mesmo para glebas e unidades) | `GET /pessoas/:id/imoveis` |
| `GET /pessoas?busca=&tipo=` — filtra por nome, CPF, razão social, CNPJ | filtro `pessoa_id` em `/imoveis` ou `/lotes` |
| `GET /pessoas/:id` — nome, CPF, `id_legivel`, `cpf_formatado` | qualquer campo de imóvel no payload da pessoa |

Isso foi conferido rota a rota. Não é lacuna de documentação: a relação inversa não é consultável.

Montar o reverso, então, custa **uma requisição por imóvel**. Para os ~6.200 lotes da instância isso trava a tela; para um parcelamento (~100 lotes) é o mesmo custo que a busca por morador dentro do parcelamento já paga.

**Por isso o recorte é escolhido pelo usuário.** A tela lista todo mundo de cara; a coluna de imóveis só se preenche depois que ele escolhe um parcelamento para indexar — e a tela **diz** que está vazia por isso, em vez de deixar traços mudos.

É a mesma decisão de `docs/leitura-nucleo.md` § busca por morador: o usuário escolhe pagar o custo, a tela não o cobra por conta própria.

## A situação tem três estados, não dois

`completo` · `incompleto` · **`indeterminado`**.

O terceiro existe por causa do que está acima. Sem o índice, a app **não sabe** se a pessoa tem vínculo com imóvel — e "não sei" não é "não tem". Marcar de vermelho um cadastro que talvez esteja completo manda alguém corrigir o que não está quebrado, e some com a confiança na coluna inteira.

**Ausência do índice nunca vira `[]`.** É a metade da regra que é fácil de perder: o índice cobre um parcelamento, e a lista é da instância inteira, então "não está no mapa" significa *não olhei aqui* — não *não tem*. Traduzir para lista vazia marcaria `incompleto` quem está vinculada só a outro parcelamento, reintroduzindo uma camada acima o erro que os três estados existem para impedir. `vinculosConhecidos()` nomeia a regra, e um teste a trava.

Consequência aceita: **esta tela nunca conclui "não tem vínculo".** Ela não pode — provar ausência global exigiria varrer a instância inteira. Quem está no índice tem vínculo por construção; quem não está é desconhecido.

A regra em `comum/moradores.ts`:

- **nome** e **CPF** ausentes → `incompleto` sempre. Não dependem de consulta.
- **contato** e **vínculo** → só contam como falta quando foram **consultados** e vieram vazios. Não consultados → `indeterminado`, e a tela diz qual dos dois faltou olhar.

O CPF é validado pelo **Núcleo** na gravação; aqui só se pergunta se existe. Revalidar o dígito na app criaria uma segunda verdade que diverge da dele.

## A busca é do servidor, e isso é o inverso dos parcelamentos

A lista de Parcelamentos filtra **no cliente**; a de Moradores, **no servidor**. Não é incoerência:

- 60 parcelamentos cabem em memória, e a varredura já os tem;
- ~2.873 pessoas não cabem confortavelmente, e o `busca` do Núcleo já cobre nome e CPF.

O preço é o conhecido: o `busca` é `ILIKE`, então **não cruza acento** — quem digita `jose` não acha `José`. A tela avisa isso em vez de deixar o usuário concluir que a pessoa não existe.

## O total é sobre a instância, e por isso não pode sair de uma leitura que falhou

O cabeçalho da tela diz *"N pessoa(s) física(s) no Núcleo"* — afirmação sobre a **base inteira**, não sobre a página. Numa primeira carga que falhava, `moradoresTotal` ficava em `0` e a frase virava *"0 pessoa(s) física(s) no Núcleo"*: o número mais caro de errar desta tela, porque um zero desses sugere base vazia, não requisição perdida.

`numeroLido` (`comum/estado-lista.ts`) devolve `null` — nunca `0` — enquanto a leitura não concluiu, e a tela troca o número por uma frase. A tabela segue a mesma regra por `estadoDaLista`, e a paginação, que **mantém** os números da leitura anterior de propósito (perdê-los seria pior), passa a dizer que são dela.

## O índice tem quatro estados, e o pedido é separado do resultado

O índice reverso pessoa → imóveis era descrito por um campo só — `parcelamentoIndexado: number | null` —, e `null` significava duas coisas: *"o usuário não pediu nada"* **e** *"pediu, e a indexação falhou inteira"*. O `catch` zerava o campo, o `urbi-select` voltava sozinho para *"— nenhum —"*, e o banner dizia que a coluna estava **"vazia de propósito"**: um texto de intenção, dito sobre uma falha, com a escolha do usuário descartada em silêncio.

Agora há dois campos — o que o usuário **pediu** (`parcelamentoPedido`) e o que a leitura **devolveu** (`parcelamentoIndexado`) —, e `estadoDoIndice` (`comum/moradores.ts`) deriva quatro estados da diferença entre eles:

| Estado | O banner | A célula "Imóveis" |
|---|---|---|
| `nao_indexado` | *"vazia de propósito"*, com o custo explicado | `—` |
| `indexando` | *"Lendo os ocupantes de X, lote a lote…"* — e a coluna ainda não vale | `…` |
| `indexado` | *"Imóveis preenchidos para X"*, com o aviso de recorte incompleto se houver lote que não respondeu | a lista, ou a frase de vazio |
| `falhou` | **"Não foi possível indexar X"** — a coluna está vazia porque a leitura falhou, não por escolha | *"índice não montado"* |

**A célula só diz "nenhum neste parcelamento" com o recorte completo.** Com lotes que não responderam, ela diz *"nenhum nos lotes lidos — N não responderam"* (`textoImoveisDaPessoa`). Antes o banner global admitia o buraco e cada linha afirmava "nenhum" mesmo assim — e ninguém lê o banner para conferir uma célula.

**Trocar de parcelamento durante uma indexação não é mais descartado.** Era `if (this.indexando) return`, e o select ficava exibindo um parcelamento que não era o indexado. Agora cada pedido tem uma geração; o resultado de um pedido antigo que chegue depois é descartado — a escolha nova, nunca.

**O detalhe do morador diz de qual parcelamento é o recorte.** *"Nenhum neste parcelamento"* ali, sem o banner da lista por perto, era afirmação solta.

## Contato que falhou não é contato que ainda não chegou

`_carregarContatos` consulta telefones e emails pessoa a pessoa, e uma pessoa cuja consulta falha fica **sem contato consultado** — a situação dela sai `indeterminado`, que está certo. O que faltava era a célula: `…` servia para "ainda não chegou" **e** para "não vai chegar", e nada dizia se valia esperar. Agora `pessoasComFalhaDeContato` marca a falha (`estadoDoContato`), e a célula mostra *"não carregou"* no lugar do `…` — o mesmo tratamento que a coluna Pessoas da tabela de lotes já dava.

## O filtro de incompletos exclui os indeterminados

**E só conta depois de os contatos chegarem.** Com `_carregarContatos` ainda em voo, todo mundo é `indeterminado`, o filtro esvazia a tabela, e a tela escrevia *"0 de 50 nesta página têm falta comprovada"* mais *"Nenhum cadastro com falta comprovada nesta página"* — duas afirmações antes da pergunta. `resumoDoFiltroIncompletos` só libera a contagem quando não há contato pendente; contato que **falhou** não é pendência, porque não vai chegar, e esperar por ele travaria o contador para sempre.

O uso prático da coluna Situação é achar quem precisa de conserto — daí o chip **"Só cadastros incompletos"**. Ele filtra `incompleto`, e **não** `indeterminado`.

A distinção é a razão de existir do terceiro estado: varrer os indeterminados para dentro faria a lista de "conserte estes" incluir cadastros que talvez já estejam certos, e uma lista de tarefas com falso positivo é uma lista que ninguém usa.

O filtro roda no **cliente**, sobre a página carregada: a regra é da app, não do Núcleo, e depende dos contatos que vêm por sub-recurso. A tela diz quantos de quantos, para o número não parecer o total da instância.

## A unidade também tem ocupantes — e a tela dizia que não

`imovel_pessoas` liga pessoa a **qualquer subtipo de imóvel**, e o Núcleo expõe `GET /{lote|gleba|unidade}/:id/pessoas`. O detalhe do imóvel, porém, carregava ocupantes só quando a rota era `lote` — e mesmo assim escrevia **"Nenhum morador vinculado."** na unidade.

Era afirmação sem pergunta. Hoje a unidade carrega ocupantes pela mesma rota, e a frase só aparece quando a consulta foi feita e voltou vazia.

**São quatro estados, não dois** (`estadoDosOcupantes`, em `comum/moradores.ts`):

| Estado | Quando | O que a tela diz |
|---|---|---|
| `com_ocupantes` | consultado, veio gente | a lista — quem fala é ela, não uma frase |
| `vazio` | consultado, não veio ninguém | "Nenhum morador vinculado." |
| `nao_consultado` | ainda não perguntou | "Ocupantes ainda não consultados." |
| `falhou` | a requisição falhou | "Não foi possível carregar os ocupantes — o número real pode ser outro." |

**A ordem importa:** falha vence "consultado". Quem falha entra no mapa com lista vazia — para a tela não repetir a requisição a cada render —, então perguntar só pelo mapa não distinguiria falha de ausência real. É a mesma armadilha que a listagem já tratava.

**Escrita continua só no lote.** `POST /lotes/:id/pessoas` é o que o backend desta app expõe; não há rota equivalente para unidade. Em vez de um botão que a API recusaria, a unidade mostra uma linha dizendo onde fazer.

## Lote que falha não é lote vazio

Ao indexar, cada lote é uma requisição, e algumas falham. Tratar a falha como "este lote não tem ocupante" esconderia moradores reais **e** apresentaria o recorte como completo — a tela diria "nenhum imóvel" para quem tem um.

Os lotes que falharam ficam **fora** do índice e são contados: o banner diz quantos não responderam e que o recorte está incompleto. Reindexar tenta de novo.

Contatos vêm por sub-recurso, **uma requisição por pessoa visível**, em janela de 6 simultâneos (`comum/concorrencia.ts`) — o Núcleo não expande contato na listagem, mesmo motivo dos ocupantes na tabela de lotes.

## Cadastrar morador — a única escrita do app no Núcleo

`POST /api/reg360/moradores`, gate `criador` ou admin. O cliente manda um objeto só; a rota orquestra os quatro passos. Deixar o frontend encadear quatro chamadas espalharia a consistência pelo chamador e deixaria pessoa criada sem vínculo sempre que a última falhasse.

### Não é atômico, e não dá para ser

São quatro chamadas HTTP ao Núcleo — criar PF, telefone, email, vínculo — e **não existe transação entre elas**. A issue #34 pede "cria tudo ou nada"; isso não é implementável contra a API que existe, e prometê-lo seria uma mentira que só aparece no dia em que o terceiro passo falha.

O que existe no lugar é melhor para quem usa:

- **Idempotente e retomável.** Reenviar o mesmo CPF encontra a pessoa que já existe (`buscarPorChave`) e continua de onde parou. Nada é duplicado.
- **A resposta diz o que aconteceu passo a passo**, e volta **207** quando algo ficou pelo caminho. Status 201 sobre um cadastro incompleto faria a tela dizer "cadastrado" sobre o que não está.
- **`409` não é falha.** Contato ou vínculo que já existia é o caso normal ao reenviar.

### O app não valida CPF, telefone nem email

Quem normaliza e recusa é o Núcleo. Reimplementar aqui criaria uma segunda verdade que diverge da dele — e o dígito verificador do CPF é o exemplo clássico de regra que se copia errado.

O que a tela faz é **levar o erro dele ao campo certo**: erro genérico manda o usuário adivinhar qual campo consertar.

Uma exceção que não é exceção: o app extrai os **dígitos** do CPF para a busca de duplicata. Isso não é validar — é usar o formato **armazenado**. O Núcleo guarda só dígitos, então procurar por `099.775.791-48` não acharia `09977579148`, e o cadastro criaria a duplicata que a rota promete evitar. Na **criação**, o valor vai como o usuário digitou.

### `tipo_vinculo` aparece na tela, com rótulos humanos

`posse_legitima` / `posse_ilegitima` / `usuario` é distinção **jurídica** do Núcleo, relevante na regularização — não detalhe técnico a esconder.

### Desvincular tem rota própria

`POST /moradores/desvincular/:loteId/:vinculoId`, com confirmação na tela. Rota separada porque é a operação inversa: juntá-la ao cadastro faria um formulário de criação carregar poder de apagar.

## Ações da pessoa

O detalhe do morador lista as ações judiciais em que ela é parte, com os mesmos cartões da aba do lote. A fonte é `GET /acoes?pessoa_id=`.

**É a única tela onde ação sem imóvel aparece.** A aba do lote filtra por `imovel_id`+`imovel_tipo`, então ação registrada só contra uma pessoa não cabe nela — não por omissão, mas porque não há imóvel por onde encontrá-la. Aqui ela aparece.

Editar e remover seguem o gate de sempre (`criador` ou admin da app); **registrar** ação continua sendo pela aba Ações do imóvel. O contrato dos vínculos de pessoa — inclusive por que trocar o papel de alguém é remover mais criar — está em [`acoes.md`](acoes).

**A tela não busca nome de pessoa para os vínculos.** O backend não lê o Núcleo, então o vínculo devolve só `pessoa_id`. O nome aparece onde a tela já o viu: nos ocupantes do lote aberto, na pessoa aberta, ou no resultado da busca do formulário de ação. Id que não resolve fica **à mostra** (`#123`) em vez de sumir.

## O que ainda não existe

**Criar ação a partir da pessoa.** O backend aceita ação só com pessoa; a tela do morador só lista. É o caso de uma ação que nasce sem imóvel — hoje ela precisa ser registrada a partir de um lote e depois ter o imóvel desvinculado.
