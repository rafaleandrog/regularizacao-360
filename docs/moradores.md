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

## Lote que falha não é lote vazio

Ao indexar, cada lote é uma requisição, e algumas falham. Tratar a falha como "este lote não tem ocupante" esconderia moradores reais **e** apresentaria o recorte como completo — a tela diria "nenhum imóvel" para quem tem um.

Os lotes que falharam ficam **fora** do índice e são contados: o banner diz quantos não responderam e que o recorte está incompleto. Reindexar tenta de novo.

Contatos vêm por sub-recurso, **uma requisição por pessoa visível**, em janela de 6 simultâneos (`comum/concorrencia.ts`) — o Núcleo não expande contato na listagem, mesmo motivo dos ocupantes na tabela de lotes.

## O que ainda não existe

**Cadastrar morador** (issue #34). É a única escrita do app no Núcleo, e depende de `req.nucleo.batch('pessoas_fisicas', …)` mais `chamarSubrecurso` para telefones, emails e o vínculo com o lote. Enquanto não entra, a tela não oferece o botão — botão que a API vai recusar é pior que botão ausente.

**Aba de Ações na pessoa** (issue #32). Ação que existe só contra alguém, sem imóvel vinculado, ainda não aparece em tela nenhuma. Agora que a tela da pessoa existe, é ali que ela entra.
