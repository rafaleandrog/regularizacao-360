---
titulo: Importação do Planilhão
descricao: Mapeamento Planilhão → Núcleo e procedimento de importação inicial (spec §7).
tipo:
---

# Importação de dados do Planilhão

> Import inicial grande + porta aberta para importações incrementais. Fonte única: **Planilhão** (Excel, ~6.000 linhas). O Airtable legado não é usado.

O reg360 não guarda dados territoriais próprios — eles vivem no **Núcleo**. A importação escreve no Núcleo através do proxy do reg360 (`/api/reg360/nucleo/*`), autorizado pelas flags de escrita do app (parcelamentos, matrículas, imóveis, pessoas).

## Escopo (MVP)

Entra: estrutura territorial + pessoas. **Fica de fora: Transação** — a entidade ainda não existe no Núcleo (spec §3.1). Os campos de status do Planilhão ("Contratado", "CP", "Vendido", "Estoque") que indicam tipo de transação só serão importados quando a Transação existir.

## Mapeamento Planilhão → Núcleo (§7)

| Planilhão | Entidade do Núcleo | Campo | Chave de upsert |
|---|---|---|---|
| Setor | `setores_habitacionais` | `slug`, `nome` | `slug` — **deve pré-existir** (reg360 é read-only em setores; crie os 5 via `editor_nucleo`) |
| PAR (Parcelamento/Empreendimento) | `parcelamentos` | `slug`, `nome`, `setor_habitacional_id` | `slug` |
| Matrícula | `matriculas` | `numero` | `numero` |
| QD, CJ, LT, Endereço, Área, Matrícula | `lotes` | `quadra`, `conjunto`, `numero_lote`, `rua`, `area`, `matricula_id` | `(parcelamento_id, quadra, conjunto, numero_lote)` |
| Morador, CPF | `pessoas_fisicas` | `nome`, `cpf` | `cpf` |
| (ocupação morador↔lote) | `imovel_pessoas` | vínculo | *pendente — falta endpoint; ver TODO no script* |
| Status ("Contratado"/"CP"/"Vendido") | Transação | — | **adiado** (entidade futura) |

Regra do Núcleo: cada **Lote** gera automaticamente **1 Unidade default** — o script não cria unidades. Frações ideais (Incorporação → N unidades) são exceção e não entram neste import.

## Pré-requisitos

1. **Setores Habitacionais criados** no Núcleo (via `editor_nucleo`) — só 5, na Fazenda Paranoazinho.
2. **Flags de Núcleo do reg360 habilitadas** em `Admin → Apps → reg360 → Núcleo`: escrever em `parcelamentos`, `matriculas`, `imoveis`, `pessoas` (começam desligadas).
3. **Token de API** de um usuário com nível `escrita`+ no reg360.
4. Planilhão exportado para **CSV UTF-8** (Rafael unifica as fontes antes).

## Procedimento

```bash
# 1. DRY-RUN (não escreve nada — confere mapeamento e erros)
URBI_BASE=https://urbiverso.com.br URBI_TOKEN=<token> \
  node apps/reg360/scripts/importar-planilhao.mjs planilhao.csv

# 2. Execução real (idempotente — pode reprocessar sem duplicar)
URBI_BASE=https://urbiverso.com.br URBI_TOKEN=<token> \
  node apps/reg360/scripts/importar-planilhao.mjs planilhao.csv --executar
```

O script (`scripts/importar-planilhao.mjs`) é determinístico e idempotente: faz upsert por chave natural (slug/número/CPF), então reexecuções cobrem correções e importações incrementais sem duplicar. Ajuste, no topo do script, as constantes `COLUNAS` (cabeçalhos reais do Planilhão) e `ENDPOINTS` (confira contra o Núcleo da instância) antes do primeiro import.

> ⚠️ O script ainda não foi executado contra dados reais nem contra um Núcleo rodando — rode sempre o dry-run primeiro e valide o resumo/erros.

## Conferência

Não há conferência automática com fontes externas — o Dashboard do reg360 mostra os cálculos a partir do que foi importado (spec §7). Após o import, navegue Setor → Parcelamento → Unidade no app e confira contagens/áreas.
