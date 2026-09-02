---
titulo: Modelo de dados
descricao: As seis tabelas do schema reg360, por que cada uma existe fora do Núcleo, e por que a referência é lógica e nunca FK.
tipo:
---

# Modelo de dados

> A pergunta que este doc responde é sempre a mesma: **por que este campo não está no Núcleo?**

## A regra que gerou todas elas

O monorepo `urbiverso/urbiverso` é **somente leitura** para este trabalho. Campo que falta no Núcleo não vira coluna nova lá — vira tabela no schema `reg360`, com referência lógica por id.

Isso não é preferência de arquitetura. É a restrição de partida, e ela explica a existência de cada tabela abaixo. Onde o Núcleo já entrega o dado, o app **lê e não copia**: `id_legivel`, `cpf_formatado`, `telefone_formatado`, `area_efetiva` e o status derivado de `data_registro` vêm prontos, e remontá-los criaria uma segunda verdade que diverge.

## Referência lógica, nunca FK

Nenhuma tabela daqui tem chave estrangeira para o Núcleo. Elas guardam o id e ponto.

A consequência é assumida: **um id que não resolve não é impedido na gravação**. O backend não lê o Núcleo (`req.nucleo` não tem `listar` nem `buscar` — ver [leitura-nucleo.md](leitura-nucleo)), então não há como conferir antes. A tela mostra o número cru (`#123`) em vez de esconder a linha: vínculo invisível é pior que vínculo esquisito, porque ninguém conserta o que não vê.

---

## `propostas` — condições comerciais por período

O que a UP cobra por m², e desde quando até quando. Não existe no Núcleo porque é regra **comercial** da UP, não fato registral do imóvel.

**Quatro níveis** (`setor`, `parcelamento`, `lote`, `unidade`) e a resolução em cascata do mais específico para o mais geral. Único composto `(nivel, ref_id, data_proposta)` — a mesma proposta não é criada duas vezes para o mesmo alvo no mesmo dia.

`lote` entrou porque o objeto de negociação é o Lote. E **unidade é mais específica que lote**, não menos: no Núcleo a unidade fica dentro da incorporação, que se ergue sobre o lote.

Detalhes em [propostas-cascata.md](propostas-cascata).

## `parcelamento_dados` — o trâmite da regularização

**Um registro por parcelamento**, e é a tabela que melhor ilustra a regra desta página.

O Núcleo sabe se um parcelamento está registrado — ele deriva isso de `data_registro`. O que ele **não** sabe é o caminho até lá: quando o projeto foi enviado, quando o CONPLAN aprovou, qual o número do decreto do GDF, quais as áreas poligonal, de viário e de servidão, e se há caução ou prenotação.

Esses campos são do processo administrativo da UP, não do registro do imóvel. Guardá-los aqui é o que permite a tela dizer **em que fase** cada parcelamento está — e a fase é *derivada das datas*, nunca persistida, porque status guardado diverge do dado que o originou.

O `status` do Núcleo continua exibido ao lado, como dado registral de apoio, sem competir com a fase. Ver [regularizacao.md](regularizacao).

## `imovel_dados` — preço e quitação por imóvel

Chave composta `(imovel_id, imovel_tipo)`, porque **lote 5 e unidade 5 são objetos diferentes** — filtrar só por id devolveria os dois.

Guarda o que o Núcleo não tem: o **preço de contrato** (`preco_estatico`), o **preço manual** que sobrepõe a proposta, e a marca de **quitação** com autoria e data.

O preço de contrato merece nota: enquanto a entidade Transação não existir no Núcleo, ele é o **único lugar onde o valor combinado de um contrato firmado sobrevive**. É por isso que ele é de gravação única e tem gate próprio — ver [precos.md](precos) e [quitacao.md](quitacao).

Índice em `(imovel_tipo, quitado)`, que é o que o filtro da tabela de lotes usa.

## `acoes` + `acao_imoveis` + `acao_pessoas` — litígio

Três tabelas porque uma ação é **sobre imóveis e/ou pessoas**: dois vínculos N:N, e a regra de que ao menos um precisa existir. Ação sobre nada seria invisível em toda tela.

A regra vale na **criação e na desvinculação**: remover o último vínculo devolve `409`, com a instrução de vincular outro antes ou remover a ação inteira. Checar só na criação não é invariante — é uma checagem que a operação seguinte desfaz.

Ficam no schema do app **sem relação com outros apps** — nada de integração com o `charles3`, que vive em outro repositório.

O polo (`up_contra` / `contra_up`) é dado, não texto: os títulos do legado carregam quem move contra quem. Ver [acoes.md](acoes).

---

## O que **não** virou tabela

**Transação.** A entidade **existe no Núcleo** (`transacoes`), e é por isso que o app nunca criou uma cópia dela aqui: uma tabela própria teria virado a segunda Transação da UP no dia em que esta chegasse. O que existe é um **adaptador com interruptor**, ainda desligado — ver [transacao-integracao.md](transacao-integracao) e a **#80**.

**Uso e Tipo de Lote.** Vão morar no objeto **Lote do Núcleo**. Criar as colunas em `imovel_dados` agora daria uma segunda fonte da verdade para o mesmo dado, exatamente o que esta página inteira existe para evitar. As issues #19, #20 e #21 precisam ser reescritas nesse sentido.

**Situação de cadastro do morador.** É **derivada** de nome, CPF, contatos e vínculo — nenhum campo novo. E tem três estados, não dois, porque o Núcleo não expõe pessoa → imóveis e "não sei" não é "não tem". Ver [moradores.md](moradores).

---

## Convenções comuns

Todas as seis tabelas são `acesso_externo: "restrito"` e `soft_delete: true`.

**Restrito** significa que não há CRUD genérico: todo acesso passa por rota do app, que aplica os gates de role. É o que impede um cliente de escrever `quitado` por um caminho que não checa `validador_interno`.

Os três roles de escrita: `criador` (cadastra), `validador_interno` (aprova proposta e constata quitação) e `editor_regularizacao` (edita o trâmite do parcelamento). Ver [fluxos.md](fluxos).
