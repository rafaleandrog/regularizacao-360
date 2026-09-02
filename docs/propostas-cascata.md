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

## Não existe "o lote" de uma unidade

No Núcleo, `unidades` tem `incorporacao_id` (NOT NULL) e **não tem** `lote_id` nem `parcelamento_id`. `incorporacoes` não tem pai nenhum — só `id`, `nome` e `slug`. O único caminho para cima é:

```
unidade → incorporação → lotes com aquele incorporacao_id → parcelamento
```

E `lotes.incorporacao_id` é **N:1**: vários lotes podem apontar para a mesma incorporação.

**A consequência é que o elo `lote` de uma unidade muitas vezes não existe**, e eleger um irmão qualquer inventaria um vínculo que o Núcleo não modela — com o efeito prático de o preço herdado sair de um lote arbitrário.

A regra, em `comum/unidade-cadeia.ts` (`paiDaUnidade`), é:

| Lotes da incorporação | Elo `lote` | Elo `parcelamento` | A tela diz |
|---|---|---|---|
| exatamente 1 | esse lote | o dele | nada — é o caso comum |
| vários, mesmo parcelamento | **pulado** | o comum a todos | que a herança pula o nível de Lote |
| vários, parcelamentos diferentes | **pulado** | **nenhum** | que só vale proposta na própria unidade |
| nenhum | pulado | nenhum | que não há de onde herdar |

**Antes deste tratamento a unidade não herdava nada.** A tela passava `this.detalhe?.lote_id` e `this.detalhe?.parcelamento_id` — duas colunas que a tabela `unidades` não tem — então os dois eram sempre `undefined`, e `_carregarContextoDoImovel` só resolvia o parcelamento `if (d.parcelamento_id)`. A cadeia de uma unidade era literalmente `[unidade]`: sem lote, sem parcelamento e sem setor. O comentário no código declarava a intenção oposta; o código não a cumpria.

Quando uma proposta vence, deixa de ser vigente e a cascata **sobe automaticamente**. Nenhum imóvel fica sem preço de referência porque **sempre há uma Proposta Tabela vigente no Setor** (RN-02).

### Implementação

- Lógica pura e testada em `comum/cascata.ts`: `montarCadeia()`, `selecionarVigente()`, `dentroDaVigencia()`.
- Rota `GET /api/reg360/propostas/vigente?nivel&ref_id[&lote_id&parcelamento_id&setor_id]`. O backend **não** resolve a hierarquia no Núcleo (o helper `req.nucleo` não lê) — o frontend, que já conhece os pais pela navegação, passa os ids. A rota percorre a cadeia do mais específico ao mais geral e devolve `{ vigente, origem_cascata }`.
- No máximo uma consulta por elo, parando na primeira que resolve: quatro níveis = no máximo quatro consultas.

### Os dois eixos de status na tela

Aprovação e vigência são **eixos diferentes**, e a tela mostra os dois. Uma proposta `aprovada` cuja `data_fim_vigencia` já passou aparecia só como "aprovada", em verde — e não vale mais nada. `statusVigencia()` (em `comum/cascata.ts`, testado) devolve `pendente` / `futura` / `vigente` / `vencida`, e cada card carrega os dois badges.

### Preço herdado é dito, não deduzido

Quando o imóvel não tem proposta própria vigente, a aba mostra um banner nomeando **de qual nível** o preço veio e qual é o valor. Sem isso, uma lista vazia de propostas ao lado de um preço no topo parece defeito.

### "Nenhuma proposta neste nível" é afirmação sobre a cascata

A lista vazia tem três causas, e duas delas não são "não há proposta": a carga ainda corre, ou ela falhou. O estado vazio distingue as três.

Duas coisas mudaram junto com isso, e as duas eram defeito:

- **`_carregarPropostas` não tinha `try/catch`.** A falha subia para o `catch` da carga da view, que marca `cargaFalhou` e **interrompe o resto** da carga do imóvel. Agora a falha da lista fica na lista.
- **A lista não era zerada na troca de alvo.** Navegar de um lote para outro mantinha as propostas do anterior na tela, sob o nome do novo — e, no caminho de falha, para sempre. O reset é síncrono, no topo de `_carregar()`, antes do primeiro `await`.

## Proposta Tabela de Setor (RN-02)

Propostas de `nivel=setor` e `tipo_proposta=tabela` são a base mínima de precificação e **nunca devem ficar sem vigência**. A rotina diária `checar_propostas_vencendo` (framework de Rotinas) verifica as que vencem em até 24h e notifica os `validador_interno` para renovar. Controle de duplicata pela flag `notificacao_vencimento_enviada`.

## Copiar proposta (RN-08)

O botão **Copiar** duplica uma proposta como nova, sempre com status `pendente` (mesmo que a original fosse aprovada) — equivale a renovar. Rota `POST /propostas/:id/copiar`; o corpo pode sobrescrever datas/valores antes de salvar.

## Imutabilidade (RN-03)

Proposta `aprovada` não pode ser alterada (`PATCH` retorna `409`). Somente admin pode intervir.
