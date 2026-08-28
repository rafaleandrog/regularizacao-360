---
titulo: Fluxos
descricao: Os fluxos do app com os papéis reais — proposta, morador, quitação — e o que muda quando a Transação existir.
tipo:
---

# Fluxos principais

## Papéis

| Papel | O que faz |
|---|---|
| **criador** | Cria, edita e copia Propostas. Grava preço de contrato e preço manual. Registra e edita Ações. Cadastra morador e vincula ao imóvel — a única escrita das telas no Núcleo. |
| **validador_interno** | Aprova Propostas pendentes. **E registra quitação** — que é constatação financeira, não cadastro, e por isso segue o mesmo perfil que aprova, não o que cadastra. |
| **editor_regularizacao** | Edita o trâmite de regularização dos Parcelamentos: datas, decreto, áreas, situação registral. |

Admin da app faz bypass de todos. Permissão padrão: `leitura` — todos consultam, inclusive as Ações, porque quem enxerga o lote precisa saber que há litígio sobre ele.

**O gate da tela e o da API são o mesmo.** Botão que aparece e toma `403` é defeito: quem não tem o papel não vê o controle.

## Fluxo 1 — Criar e aprovar proposta

1. Criador acessa Setor/Parcelamento/Unidade → **Criar Proposta** → preenche o formulário (`urbi-modal`).
2. `POST /propostas` valida o papel `criador`, força `status_aprovacao=pendente` e `criado_por_id`, e publica **`proposta_criada`**.
   - Inscrições automáticas: os `validador_interno` atuais são inscritos em `proposta_criada` (idempotente, via `req.shell.listarUsuariosPorRole`); o criador é inscrito em `proposta_aprovada` filtrado por aquela proposta.
3. Validador recebe a notificação → abre a proposta → **Aprovar**.
4. `POST /propostas/:id/aprovar` valida `validador_interno`, muda o status para `aprovada`, grava `aprovado_por_id` e publica **`proposta_aprovada`** (notifica o criador).
5. Dentro das datas de vigência, a proposta entra na cascata como vigente.

## Fluxo 2 — Copiar (renovar) proposta

1. Em uma proposta existente → **Copiar** → formulário pré-preenchido.
2. Ajusta datas/valores → `POST /propostas/:id/copiar` cria nova como `pendente` → segue o Fluxo 1.

## Fluxo 3 — Cadastrar morador

1. Criador acessa **Moradores → Cadastrar Morador**, ou o detalhe do Lote → **Vincular morador** (aí o imóvel já vem preenchido).
2. `POST /moradores` orquestra os quatro passos no Núcleo: achar-ou-criar a pessoa, telefone, email, vínculo com o lote.
3. **Não é atômico** — são quatro chamadas HTTP sem transação entre elas. Em troca é **idempotente e retomável**: reenviar o mesmo CPF acha a pessoa existente e continua de onde parou, e a resposta diz o que aconteceu passo a passo.

O app não valida CPF, telefone nem email: quem normaliza e recusa é o Núcleo, e o erro dele chega ao campo certo na tela.

## Fluxo 4 — Marcar imóvel como quitado

1. **Validador interno** abre o lote → **Marcar como quitado**.
2. `POST /imovel-dados/:tipo/:id/quitar` grava a flag **com autoria e data** — marca sem autoria não responde a "quem disse que estava quitado?".
3. Desmarcar existe, pede confirmação e limpa autoria e data junto.

É marca, não cálculo: o saldo devedor vive na base do financeiro, fora do escopo. Ver [quitacao.md](quitacao).

## Fluxo 5 — Registrar transação *(preparado, aguardando o Núcleo)*

A entidade Transação **ainda não existe no Núcleo**. O que existe é um adaptador de três arquivos com um **interruptor único** (`DISPONIVEL`): quando ela existir, liga-se o adaptador e nenhuma tela muda.

A aba **Transações** no lote não tem botão morto — ela explica o que falta e diz onde o valor combinado está sendo guardado enquanto isso (o preço de contrato). As três datas de assinatura já aparecem, com `—`, porque a tela já sabe montá-las. Ver [transacao-integracao.md](transacao-integracao).

## Dashboard e KPIs

As páginas de detalhe mostram KPIs (`urbi-kpi`) com contagens, áreas e o preço vigente resolvido por cascata.

**O VGV existe e é calculado** — `Σ (preço aplicável × area_efetiva)`, potencial e não realizado, agregado no cliente porque `req.nucleo` não lê no backend. Ele não depende de Transação, e não mostra placeholder: enquanto as bases não estão em memória, diz que está calculando, e **nunca** exibe `R$ 0` sobre base vazia. Ver [vgv.md](vgv).

## Quando a Transação existir

O app mostrará um alerta se o preço/m² da transação diferir do da proposta vigente — informativo, não bloqueia.
