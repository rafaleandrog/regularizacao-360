---
titulo: Fluxos
descricao: Fluxos de criação/aprovação de propostas, cópia, transações e dashboard.
tipo:
---

# Fluxos principais

## Papéis

- **criador** (escrita) — cria/edita/copia Propostas; edita Unidades e Pessoas no Núcleo.
- **validador_interno** (escrita) — aprova Propostas pendentes.
- **editor_regularizacao** (escrita) — edita campos de status de regularização dos Parcelamentos.

Admin faz bypass de todos os papéis. Permissão padrão do app: `leitura` (todos consultam).

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

## Fluxo 3 — Registrar transação *(preparado; inativo)*

A entidade Transação ainda não existe no Núcleo. A aba **Transações** na Unidade está desabilitada ("em breve") e as rotas `POST /transacoes` / `/transacoes/:id/aprovar` retornam **`501`** (RN-09). Quando a Transação existir, estas rotas viram proxy para o Núcleo (criar → aprovar → VGV) seguindo o mesmo padrão de aprovação.

## Dashboard e KPIs

Páginas de detalhe (Setor/Parcelamento/Unidade) mostram KPIs (`urbi-kpi`): contagens e áreas a partir dos dados do Núcleo, e o preço vigente resolvido por cascata na Unidade. **VGV** depende de Transação — exibe placeholder até a entidade existir.

## Compatibilidade informativa (RN-06)

Quando a Transação existir, ao registrá-la o app mostrará um alerta visual se o preço/m² diferir do preço da proposta vigente — informativo, não bloqueia.
