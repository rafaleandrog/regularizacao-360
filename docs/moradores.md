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

## O filtro de incompletos exclui os indeterminados

O uso prático da coluna Situação é achar quem precisa de conserto — daí o chip **"Só cadastros incompletos"**. Ele filtra `incompleto`, e **não** `indeterminado`.

A distinção é a razão de existir do terceiro estado: varrer os indeterminados para dentro faria a lista de "conserte estes" incluir cadastros que talvez já estejam certos, e uma lista de tarefas com falso positivo é uma lista que ninguém usa.

O filtro roda no **cliente**, sobre a página carregada: a regra é da app, não do Núcleo, e depende dos contatos que vêm por sub-recurso. A tela diz quantos de quantos, para o número não parecer o total da instância.

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

## O que ainda não existe

**Aba de Ações na pessoa** (issue #32). Ação que existe só contra alguém, sem imóvel vinculado, ainda não aparece em tela nenhuma. Agora que a tela da pessoa existe, é ali que ela entra.
