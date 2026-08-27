---
titulo: Propostas e Cascata
descricao: Vigência de propostas e resolução em cascata nos quatro níveis (Setor → Parcelamento → Lote → Unidade).
tipo:
---

# Propostas comerciais e cascata

A **Proposta** é o único dado próprio do reg360 (tabela `propostas`, schema `restrito` — todo CRUD passa por rotas customizadas). Define as condições comerciais vigentes de um período, associada a um **Setor Habitacional**, **Parcelamento**, **Lote** ou **Unidade** (`nivel` + `ref_id`, referência lógica ao Núcleo, sem FK).

## Status

**Vigência** (calculada a partir das datas):
- **Futura** — `data_proposta` ainda não chegou.
- **Vigente** — aprovada e dentro de `[data_proposta, data_fim_vigencia]`.
- **Vencida** — `data_fim_vigencia` já passou.

**Aprovação**: `pendente` (criada) → `aprovada` (validada por `validador_interno`). Uma proposta só entra na cascata quando **aprovada e vigente**.

## Cascata (RN-01)

A proposta vigente de um imóvel é resolvida subindo a hierarquia — a mais específica prevalece:

1. Proposta própria da **Unidade** (aprovada e vigente) → usa essa.
2. Senão, proposta do **Lote**.
3. Senão, proposta do **Parcelamento**.
4. Senão, proposta do **Setor Habitacional**.

**Por que a Unidade fica acima do Lote.** No Núcleo, `unidades.incorporacao_id` é NOT NULL: a unidade existe dentro de uma incorporação, que se ergue **sobre** o lote. Então a unidade é o nível mais específico, e o lote é a folha no caso comum — a maioria dos lotes não tem incorporação nenhuma.

**Elo sem id conhecido é pulado, não invalida a cadeia.** Uma unidade cujo lote-pai não veio ainda herda do parcelamento. É por isso que a ordem de carregamento importa na tela: o contexto do imóvel (parcelamento, e daí o setor) é resolvido **antes** da cascata — senão o elo de Setor sumiria, e é justamente lá que mora o preço-base que sempre existe.

Quando uma proposta vence, deixa de ser vigente e a cascata **sobe automaticamente**. Nenhum imóvel fica sem preço de referência porque **sempre há uma Proposta Tabela vigente no Setor** (RN-02).

### Implementação

- Lógica pura e testada em `comum/cascata.ts`: `montarCadeia()`, `selecionarVigente()`, `dentroDaVigencia()`.
- Rota `GET /api/reg360/propostas/vigente?nivel&ref_id[&lote_id&parcelamento_id&setor_id]`. O backend **não** resolve a hierarquia no Núcleo (o helper `req.nucleo` não lê) — o frontend, que já conhece os pais pela navegação, passa os ids. A rota percorre a cadeia do mais específico ao mais geral e devolve `{ vigente, origem_cascata }`.
- No máximo uma consulta por elo, parando na primeira que resolve: quatro níveis = no máximo quatro consultas.

### Os dois eixos de status na tela

Aprovação e vigência são **eixos diferentes**, e a tela mostra os dois. Uma proposta `aprovada` cuja `data_fim_vigencia` já passou aparecia só como "aprovada", em verde — e não vale mais nada. `statusVigencia()` (em `comum/cascata.ts`, testado) devolve `pendente` / `futura` / `vigente` / `vencida`, e cada card carrega os dois badges.

### Preço herdado é dito, não deduzido

Quando o imóvel não tem proposta própria vigente, a aba mostra um banner nomeando **de qual nível** o preço veio e qual é o valor. Sem isso, uma lista vazia de propostas ao lado de um preço no topo parece defeito.

## Proposta Tabela de Setor (RN-02)

Propostas de `nivel=setor` e `tipo_proposta=tabela` são a base mínima de precificação e **nunca devem ficar sem vigência**. A rotina diária `checar_propostas_vencendo` (framework de Rotinas) verifica as que vencem em até 24h e notifica os `validador_interno` para renovar. Controle de duplicata pela flag `notificacao_vencimento_enviada`.

## Copiar proposta (RN-08)

O botão **Copiar** duplica uma proposta como nova, sempre com status `pendente` (mesmo que a original fosse aprovada) — equivale a renovar. Rota `POST /propostas/:id/copiar`; o corpo pode sobrescrever datas/valores antes de salvar.

## Imutabilidade (RN-03)

Proposta `aprovada` não pode ser alterada (`PATCH` retorna `409`). Somente admin pode intervir.
