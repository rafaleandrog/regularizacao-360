---
titulo: Integração de Transação
descricao: O que plugar no dia em que a entidade Transação existir no Núcleo — e o que NÃO fazer com o preço de contrato.
tipo:
---

# Integração de Transação

> A entidade Transação **já existe no Núcleo** (`transacoes`, confirmado no bundle do SDK 52) — e o adaptador continua **desligado**. Este doc é o roteiro da virada, escrito enquanto o contexto estava fresco; a **#80** carrega o que ele não previu, por ter sido escrito antes de a entidade existir. Leia os dois.

## O interruptor

`DISPONIVEL` em `comum/transacoes-contrato.ts`. Uma constante, um lugar.

Trocá-la para `true` **não deve exigir mexer em tela nenhuma**. Se exigir, é porque alguma tela passou a conhecer o formato de Transação — e aí o conserto é devolver esse conhecimento ao adaptador, não editar a tela.

## Os três arquivos, e só eles

| Arquivo | Papel |
|---|---|
| `comum/transacoes-contrato.ts` | O formato que o app espera, as derivações puras (`datasDeAssinatura`, `tipoMaisAvancado`, `statusTransacao`) e o interruptor |
| `backend/transacoes.ts` | Adaptador do backend. Hoje responde `501` em tudo; amanhã chama `req.nucleo` |
| `frontend/transacoes.ts` | Adaptador do frontend. A tela pergunta a ele, nunca ao formato |

Um `grep -i transac` fora desses três não deve achar lógica de negócio. Se achar, uma costura vazou.

## O que fazer no dia

1. **Declarar `transacoes`** em `dependencias_nucleo` e `permissoes_nucleo` do `manifesto.json`. Sem isso as chamadas tomam `403 NUCLEO_FLAG_NAO_PEDIDA` — que é falha de desenvolvimento, não de operação (ver [leitura-nucleo.md](leitura-nucleo)).
2. **Ligar o toggle** na instância, em `Admin → Apps → reg360 → Núcleo`. Quem liga precisa da alçada `nucleo`.
3. **Implementar os três handlers** de `backend/transacoes.ts`, que hoje lançam se forem alcançados com o interruptor ligado. Isso é deliberado: adaptador ligado sem implementação deve **quebrar alto**, não devolver vazio silencioso.
4. **Ligar a leitura do frontend** em `transacoesDoImovel`, que hoje devolve `[]`.

   O frontend **pergunta ao servidor** (`GET /transacoes-estado`) uma vez por sessão e memoriza: `DISPONIVEL` é só o padrão de build. Sem isso, ligar a integração no backend não teria efeito em cliente com bundle antigo em cache. Falha de rede mantém o que já se sabia — tratá-la como "indisponível" faria uma queda momentânea esconder a aba inteira.
5. **Trocar `DISPONIVEL` para `true`.**
6. Conferir que a aba do lote mostra as transações, que as três datas de assinatura preenchem e que o badge de estágio aparece no cabeçalho — tudo isso **já está escrito e testado** com dados sintéticos.
7. **Olhar o banner de catálogo divergente.** Se ele aparecer, os tipos do Núcleo não batem com `TIPOS_TRANSACAO` — reconcilie antes de dar a virada por concluída, senão o estágio fica errado para todo imóvel que usa um tipo não mapeado. Ver a seção sobre o catálogo, abaixo. É a **#80**.

## Duas decisões de derivação que valem ler antes de mexer

**O estágio é o tipo mais avançado, não o mais recente**, e o avanço sai de `NIVEL_ESTAGIO` — um **mapa explícito**, não a posição num array. Derivar da ordem de escrita de uma constante acoplaria a regra à estética: reordenar a lista mudaria o badge de todo imóvel, em silêncio.

`escritura` é o topo, porque é o fim da regularização. **`cessao` fica abaixo dela**: ceder posição contratual transfere *quem* está no contrato, não avança o imóvel — uma cessão registrada depois não pode fazer um imóvel já escriturado regredir. E fica acima de `promessa_compra_venda`, porque uma cessão pressupõe um contrato existente para ceder.

**Isso é premissa, não certeza.** Se a UP tratar cessão como estágio próprio, o número muda em `NIVEL_ESTAGIO` e em nenhum outro lugar.

**Cancelada não conta em lugar nenhum.** Nem nas datas de assinatura, nem no estágio. Mostrar a data de uma transação cancelada diria que o imóvel caminhou onde ele voltou.

## O catálogo de tipos pode divergir — e a divergência não fica muda

`TIPOS_TRANSACAO` (`pre_contrato`, `promessa_compra_venda`, `cessao`, `escritura`) foi escrito **antes de a entidade existir no Núcleo**, quando não havia com o que conferir. O Núcleo tem o descritor como **fonte única**, em `GET /transacoes/tipos`, e o vocabulário dele é mais largo — a doc cita permuta, rescisão, usucapião.

**Reconciliar as duas listas é pré-requisito da virada, não acabamento.** O motivo está no desenho das derivações: `tipoMaisAvancado` e `datasDeAssinatura` descartam tipo fora do catálogo, com um `continue`. Isso é correto — não há nível a atribuir a um tipo desconhecido, e comparar com `undefined` esconderia o problema atrás de uma comparação sempre falsa.

Mas descartar **sem contar** é como a divergência vira invisível: o badge de estágio some de todos os lotes, as datas ficam vazias, e nada distingue isso de *"este imóvel não tem transação"*. A falha seria ausência, não erro — e ninguém procura o que não apareceu.

Por isso existe `tiposDesconhecidos` em `comum/transacoes-contrato.ts`, e o aviso pronto para tela em `avisoCatalogoTransacao` (`frontend/transacoes.ts`). A aba do lote mostra um banner nomeando os tipos que o app não conhece e dizendo que o catálogo precisa ser reconciliado.

Duas escolhas dentro dela:

- **Rascunho conta.** Um rascunho de tipo desconhecido já é sinal de catálogo divergente; esperar ele ser assinado para avisar seria avisar tarde.
- **Cancelada não conta.** O catálogo não precisa cobrir o que foi desfeito.

A tela não conhece `TIPOS_TRANSACAO` — ela pergunta ao adaptador, que fala com `comum/`. A costura continua onde deveria.

## O `preco_estatico` é o substituto de hoje — e migra, não some

Enquanto a integração não está ligada, o **preço de contrato** (`imovel_dados.preco_estatico`, issue #26) é o único lugar onde o valor combinado de um contrato firmado sobrevive. É por isso que ele é imutável e tem gate próprio — ver [precos.md](precos).

Quando a Transação existir, ele vira **dado migrável**, e a migração tem uma armadilha:

- **Não apague `preco_estatico` ao migrar.** Ele carrega `preco_estatico_em` e `preco_estatico_por_id` — quem registrou e quando. Uma transação importada não recupera essa autoria, e perdê-la é perder a resposta para "quem combinou esse valor?".
- **Não presuma o tipo.** Um `preco_estatico` gravado hoje não diz se o contrato era pré-contrato, CP ou escritura. Chutar o tipo na migração produziria estágios errados em massa. O caminho honesto é migrar como transação de tipo **indeterminado** — ou não migrar, e deixar os dois convivendo até alguém classificar um a um.
- **A precedência de preço não muda.** `preco_estatico` continua vencendo a proposta vigente. Se a transação passar a ser a fonte do valor, ela entra **antes** dele na cadeia, e `comum/preco.ts` ganha um degrau — não uma reescrita.

## O que este doc não resolve

Quem escreve transação, com que alçada, e se o app cria ou só lê. Isso depende do contrato que o Núcleo publicar, e chutar agora produziria um adaptador que não encaixa. O que está pronto é a **forma da leitura** e o desenho das telas; a escrita se decide quando houver o que chamar.
