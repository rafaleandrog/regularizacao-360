---
titulo: Propostas e Cascata
descricao: Vigência de propostas e resolução em cascata (Setor → Parcelamento → Unidade).
tipo:
---

# Propostas comerciais e cascata

A **Proposta** é o único dado próprio do reg360 (tabela `propostas`, schema `restrito` — todo CRUD passa por rotas customizadas). Define as condições comerciais vigentes de um período, associada a um **Setor Habitacional**, **Parcelamento** ou **Unidade** (`nivel` + `ref_id`, referência lógica ao Núcleo, sem FK).

## Status

**Vigência** (calculada a partir das datas):
- **Futura** — `data_proposta` ainda não chegou.
- **Vigente** — aprovada e dentro de `[data_proposta, data_fim_vigencia]`.
- **Vencida** — `data_fim_vigencia` já passou.

**Aprovação**: `pendente` (criada) → `aprovada` (validada por `validador_interno`). Uma proposta só entra na cascata quando **aprovada e vigente**.

## Cascata (RN-01)

A proposta vigente de uma Unidade é resolvida subindo a hierarquia — a mais específica prevalece:

1. Proposta própria da **Unidade** (aprovada e vigente) → usa essa.
2. Senão, proposta do **Parcelamento**.
3. Senão, proposta do **Setor Habitacional**.

Quando uma proposta vence, deixa de ser vigente e a cascata **sobe automaticamente**. Nenhuma unidade fica sem preço de referência porque **sempre há uma Proposta Tabela vigente no Setor** (RN-02).

### Implementação

- Lógica pura e testada em `comum/cascata.ts`: `montarCadeia()`, `selecionarVigente()`, `dentroDaVigencia()`.
- Rota `GET /api/reg360/propostas/vigente?nivel&ref_id[&parcelamento_id&setor_id]`. O backend **não** resolve a hierarquia no Núcleo (o helper `req.nucleo` não lê por id) — o frontend, que já conhece os pais pela navegação, passa `parcelamento_id`/`setor_id`. A rota percorre a cadeia do mais específico ao mais geral e devolve `{ vigente, origem_cascata }`.

## Proposta Tabela de Setor (RN-02)

Propostas de `nivel=setor` e `tipo_proposta=tabela` são a base mínima de precificação e **nunca devem ficar sem vigência**. A rotina diária `checar_propostas_vencendo` (framework de Rotinas) verifica as que vencem em até 24h e notifica os `validador_interno` para renovar. Controle de duplicata pela flag `notificacao_vencimento_enviada`.

## Copiar proposta (RN-08)

O botão **Copiar** duplica uma proposta como nova, sempre com status `pendente` (mesmo que a original fosse aprovada) — equivale a renovar. Rota `POST /propostas/:id/copiar`; o corpo pode sobrescrever datas/valores antes de salvar.

## Imutabilidade (RN-03)

Proposta `aprovada` não pode ser alterada (`PATCH` retorna `409`). Somente admin pode intervir.
