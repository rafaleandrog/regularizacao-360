# Regularização 360 — Spec v0.9

> Sistema de gestão do ciclo de vida da regularização fundiária da UP, desde o cadastro territorial até a escrituração de unidades.

**Slug do app:** `reg360`
**Nome de exibição:** Regularização 360
**Status:** Em especificação

---

## 1. Visão Geral

A UP opera a regularização de condomínios informais na Fazenda Paranoazinho. O processo envolve controlar territórios (setores habitacionais), parcelamentos (condomínios), lotes, unidades, moradores, propostas comerciais e transações jurídico-comerciais.

Hoje esses dados vivem em sistemas desconectados: o "Planilhão" (planilha Excel com ~6.000 linhas cobrindo lotes residenciais), planilhas avulsas (comerciais/mistos), Airtable (banco legado incompleto) e Softr (interface legada).

O app centraliza tudo no UrbiVerso como fonte única da verdade, com:
- Navegação hierárquica: Setor Habitacional → Parcelamento → Lote → Unidade
- Gestão de propostas comerciais com herança em cascata
- Acesso a transações registradas no Núcleo com fluxo de aprovação *(quando disponível)*
- Controle de estoque de lotes/unidades com filtros por status e parcelamento
- Dashboard com KPIs (VGV, áreas) filtrável por status
- Suporte a frações ideais (lotes com múltiplas unidades via incorporação)

---

## 2. Modelo de Dados

### 2.1 Divisão Núcleo vs. App

O Núcleo foi redesenhado e está online (maio/2026). Entidades transversais vivem no Núcleo; dados de domínio exclusivos da regularização vivem no schema da app.

**No Núcleo (entidades existentes — consultar doc `nucleo` para schema completo):**
- **Pessoa** — supertipo com discriminador `tipo`: `fisica` | `juridica`. Para este app, o foco é em Pessoa Física (PF). Subtipos: `pessoas_fisicas` (nome, cpf) e `pessoas_juridicas` (razao_social, cnpj). Vínculos via `pessoa_id` no supertipo.
- **Setor Habitacional** (`setores_habitacionais`) — região do Plano Diretor. Campos: `slug` (UNIQUE, chave natural), `nome`. 1:N com Parcelamentos.
- **Parcelamento** (`parcelamentos`) — ato jurídico que subdivide gleba em lotes. É o que o Planilhão chama de "Empreendimento" ou "Condomínio". Campos: `slug` (UNIQUE), `nome` (rótulo livre para UI), FK `setor_habitacional_id`. 1:N com Lotes.
- **Incorporação** (`incorporacoes`) — empreendimento vertical sobre lotes. Relevante para frações ideais. Campos: `slug` (UNIQUE), `nome`. Lotes vinculados via `lotes.incorporacao_id`. 1:N com Unidades.
- **Imóvel** (`imoveis`) — supertipo com discriminador `tipo`: `lote` | `gleba` | `unidade`. Atributos comuns: `matricula_id`, `area`. Subtipos:
  - **Lote** (`lotes`) — resultado de parcelamento. Campos: `numero_lote`, `quadra`, `conjunto`, `rua`, FK `parcelamento_id`, FK `incorporacao_id` (opcional).
  - **Unidade** (`unidades`) — subdivisão de incorporação. Campos: `identificador`, `bloco`, FK `incorporacao_id`.
  - **Gleba** (`glebas`) — imóvel original antes do parcelamento (fora do escopo deste app).
- **Matrícula** (`matriculas`) — registro cartorial. Referenciada por `imoveis.matricula_id`. Proprietários formais via `matricula_proprietarios`.

**No Núcleo (entidade futura — dependência NÃO bloqueante para o MVP):**
- **Transação** — registro de contrato/documento jurídico-comercial entre UP e morador. Vinculada N:1 a uma Unidade (múltiplas transações por unidade ao longo do tempo). Detalhes na seção 2.5.

⚠️ **Transação ainda não existe no Núcleo** (Rafael, 13/06). O MVP lança **sem** a entidade Transação implementada. O app prepara o caminho (interfaces, rotas, UI) para que, quando o Núcleo disponibilizar a Transação, a integração seja direta. Ver seção 3.1 para detalhes.

**Vínculos no Núcleo:**
- `imovel_pessoas` — ocupação (N:N imóveis ↔ pessoas com `tipo_vinculo`: `posse_legitima` / `posse_ilegitima` / `usuario`). Campo `legado` marcado automaticamente quando incorporação registra sobre lote previamente ocupado.
- `matricula_proprietarios` — propriedade formal (N:N matrículas ↔ pessoas).

**No schema da app (`reg360/schema.json`):**
- **Proposta** — condições comerciais vigentes para um período. Único objeto de dados próprio do app.

**Fora do escopo (Núcleo e App):**
- Contratos e Ações judiciais — não estão no Núcleo e não entram neste MVP (confirmado por Rafael, 22/05)
- Índice Econômico — removido do MVP (confirmado por Rafael, 01/05). Futura funcionalidade do Núcleo quando houver infra.
- Adesômetro / Status de Adesão — removido do MVP (confirmado por Rafael, 27/05 e 03/06).

**Contrato de acesso:** A app declara `dependencias_nucleo` e `permissoes_nucleo` no manifesto. Acesso via `/api/reg360/nucleo/...` ou helper `req.nucleo`. Sem FK direta para tabelas do Núcleo — apenas referência lógica (ID).

### 2.2 Hierarquia Territorial

```
Setor Habitacional (1) → Parcelamento (N) → Lote (N) → [Incorporação →] Unidade (1 ou N)
```

**Terminologia Núcleo ↔ Negócio:**
- O Núcleo chama de **Parcelamento** o que o time de negócio historicamente chama de "Empreendimento" ou "Condomínio". Na UI do app, o campo `nome` do Parcelamento exibe o nome amigável (ex: "Bianca", "Império dos Nobres").
- O Núcleo usa **Incorporação** para empreendimento vertical — só relevante quando um Lote tem frações ideais (prédio, subdivisões).

**Regra de geração automática de unidades (Núcleo):**
- Todo Lote gera automaticamente **1 Unidade** associada (unidade default).
- Quando uma Incorporação é registrada sobre o Lote, a unidade default é substituída pelas N unidades da incorporação.
- Na prática da regularização, a maioria dos lotes tem exatamente 1 unidade (residencial unifamiliar). Frações ideais são exceção.

**Objeto de negociação:** O app opera no nível da **Unidade** para transações e propostas individuais, e no nível do **Parcelamento** ou **Setor** para propostas em cascata.

**Campos do Núcleo visíveis neste app:** Uso, Área, Matrícula (atributos do Imóvel/Lote).

### 2.3 Status

**Parcelamento — Status de Regularização** (calculado pelo Núcleo a partir de campos de data):

Pipeline simplificado (Rafael, 08/06):
1. **Irregular** (inicial — nenhum campo de data preenchido)
2. **Em análise** (`data_envio_projeto` preenchida — projeto urbanístico enviado)
3. **Aprovado** (`data_aprovacao_conplan` preenchida — aprovação pelo CONPLAN)
4. **Registrado** (`data_decreto_gdf` preenchida — emissão do Decreto pelo GDF que aprova o projeto de parcelamento)

Regra de cálculo: conferir campos na ordem inversa (do mais avançado para o mais inicial). O primeiro campo preenchido determina o status. Se nenhum campo de data estiver preenchido → Irregular.

Campos confirmados para entrada no Núcleo com os nomes definidos acima (Rafael, 09/06).

Situações anteriormente no pipeline (Caucionado, Prenotado) ficam em campo de status separado a ser definido em versão futura.

**Transação — Status** (derivado de datas, calculado pelo Núcleo — disponível quando Transação existir):
- **Vigente** — data_assinatura preenchida (e não rescindida nem expirada)
- **Rescindido** — data_rescisao preenchida
- **Expirado** — data_expiracao < hoje
- **Aberto** — qualquer outra situação (ex: transação criada sem data de assinatura)

**Proposta — Status de vigência** (calculado):
- Futura — Data Proposta ainda não chegou
- Vigente — aprovada por validador, dentro do período de vigência
- Vencida — Data Fim Vigência ultrapassada

**Proposta — Status de aprovação:**
- Pendente (criada, aguardando validação)
- Aprovada (validada por usuário com role validador_interno)

**Transação — Tipo** (definido na criação):
- Pré-Contrato de Regularização
- Contrato de Promessa (CP)
- Escritura
- Cessão

*(Nota: Rescisão não é um tipo de transação — é um status derivado de data_rescisao preenchida. Qualquer tipo de transação pode ser rescindido.)*

**Transação — Status de aprovação:**
- Pendente (criada, aguardando validação)
- Aprovada (validada por usuário com role validador_interno)

**Regra de imutabilidade:** Uma vez aprovada, Transação ou Proposta não pode mais ser alterada. Somente admin pode intervir.

### 2.4 Campos Detalhados — Proposta (schema da app)

A Proposta define as condições comerciais vigentes para um período, associada a um Setor Habitacional, Parcelamento ou Unidade individual.

- titulo (texto, limite 200, obrigatório) — Nome da proposta
- descricao (texto_longo) — Observações livres
- nivel (texto, limite 20, obrigatório, opções: "setor"/"parcelamento"/"unidade") — Nível de aplicação
- tipo_proposta (texto, limite 30, obrigatório, opções: "tabela"/"campanha"/"negociacao_coletiva") — Natureza da proposta
- ref_id (inteiro, obrigatório) — ID do objeto alvo (SH, Parcelamento ou Unidade no Núcleo)
- data_proposta (data, obrigatório) — Início da vigência
- data_fim_vigencia (data, obrigatório) — Fim da vigência
- status_aprovacao (texto, limite 20, obrigatório, padrão "pendente", opções: "pendente"/"aprovada") — Status de aprovação
- aprovado_por_id (referência → shell.usuarios, campos_incluir: ["nome as aprovador_nome"]) — Quem aprovou
- preco_m2 (decimal 12,2, obrigatório) — Preço principal R$/m²
- preco_minimo_residencial (decimal 12,2) — Piso para lotes residenciais
- preco_minimo_comercial_misto (decimal 12,2) — Piso para lotes comerciais/mistos
- desconto_a_vista (decimal 5,2) — % desconto pagamento à vista
- desconto_6x (decimal 5,2) — % desconto parcelamento 6x
- desconto_12x (decimal 5,2) — % desconto parcelamento 12x
- desconto_lote_grande (decimal 5,2) — % desconto extra para lotes grandes
- lote_grande_m2 (decimal 10,2) — Área mínima (m²) para acionar desconto de lote grande

**Constraint único composto:** `(nivel, ref_id, data_proposta)` — impede duas propostas para o mesmo alvo com a mesma data de início.

**Soft delete:** ativado (propostas removidas ficam como registro histórico).

**Acesso externo:** `restrito` — todo acesso via rotas customizadas para garantir regras de role e imutabilidade.

### 2.5 Campos Detalhados — Transação (entidade futura do Núcleo)

⚠️ **A Transação será uma entidade do Núcleo**, não do schema da app. Os campos abaixo descrevem o que o app espera do Núcleo **quando a entidade for implementada**. No MVP, esta seção serve como contrato de interface — o app será construído com stubs/interfaces prontas para plugar quando o Núcleo disponibilizar a Transação (Rafael, 13/06).

**Cardinalidade:** Transação ↔ Unidade é **N:1** (Rafael, 03/06 e 08/06). Uma Unidade pode ter múltiplas transações ao longo do tempo (ex: Pré-Contrato → CP → Escritura), mas cada Transação pertence a exatamente uma Unidade.

Campos baseados na definição de Rafael (03/06):

- tipo (enum) — "pre_contrato", "cp", "escritura", "cessao"
- unidade_id (inteiro) — Ref. à Unidade (Núcleo). Vínculo N:1 (múltiplas transações por unidade)
- pessoa_id (inteiro) — Ref. à Pessoa (Núcleo) — proprietário/signatário principal
- proposta_id (inteiro) — Ref. à Proposta vigente no momento da criação (opcional, referência lógica ao schema da app)
- status_aprovacao (enum) — "pendente", "aprovada"
- data_assinatura (data) — Data de assinatura. Quando preenchida → status Vigente
- vigencia_meses (inteiro) — Prazo de vigência em meses
- data_expiracao (data) — Calculada: data_assinatura + vigencia_meses. Se < hoje → status Expirado
- data_rescisao (data) — Preenchida manualmente. Se preenchida → status Rescindido
- preco_m2 (decimal) — R$/m² efetivo (preenchido ou vindo da proposta)
- valor_total (decimal) — Calculado: preco_m2 × área da Unidade
- forma_pagamento (enum) — "a_vista", "6x", "12x", "mais_parcelas"
- n_parcelas (inteiro) — Número de parcelas
- valor_sinal (decimal) — Valor do sinal (se houver)

**Acesso à Transação:** via endpoints semânticos do Núcleo (Rafael, 03/06). O app cria e lê transações chamando endpoints do Núcleo (`req.nucleo`), mantendo centralização e consistência. O Núcleo também é alimentado por CSV de fonte externa para registrar histórico pré-existente.

**Fluxo de valor (VGV):**
- Preço/m² (input) → vem da Proposta (app) ou é preenchido diretamente na Transação
- Valor Unidade (fórmula) = Preço/m² × Área (vem da Unidade no Núcleo)
- VGV = somatória dos valores das unidades com transação

### 2.6 Propostas Comerciais e Cascata

Propostas podem ser vinculadas a três níveis: Setor, Parcelamento ou Unidade. A proposta vigente de uma Unidade é resolvida em cascata:

1. Se a Unidade tem proposta própria aprovada e vigente → usa essa
2. Senão, usa a proposta aprovada e vigente do Parcelamento
3. Senão, usa a proposta aprovada e vigente do Setor Habitacional

**Proposta vencida** (Rafael, 09/06): quando uma Proposta ultrapassa a data_fim_vigencia, torna-se não vigente. Preço e demais parâmetros que vinculam ao imóvel passam a ser ignorados. A cascata sobe automaticamente para o nível superior. Nenhuma Unidade, Parcelamento ou Setor ficará sem proposta válida, porque **sempre haverá proposta vigente do Setor Habitacional como base**.

**Regra especial — Proposta Tabela de SH** (Rafael, 09/06): Propostas de nível Setor Habitacional com tipo "Tabela" **nunca podem ficar em status diferente de Vigente**. São a base mínima que garante que toda unidade tem preço de referência. Quando o prazo de vigência estiver a **24 horas** do fim (Rafael, 13/06), o sistema envia notificação automática ao usuário com alçada (validador_interno) para renovar/atualizar a proposta.

**Copiar Proposta** (Rafael, 09/06): funcionalidade de "copiar proposta" disponível como botão na seção de Propostas — equivalente a renovar. Cria uma nova proposta com os mesmos parâmetros da original, permitindo ajustar datas e valores antes de salvar.

O preço/m² de uma transação pode ser calculado a partir da proposta vigente. O app oferece comparação visual entre preço da transação e preço da proposta (informativo, não bloqueio).

A cascata será implementada via **rotas customizadas** no backend (confirmado por Rafael, 24/05) — não via lógica genérica do framework de dados.

### 2.7 Dependências no Núcleo

Para o funcionamento completo deste app, os seguintes campos/entidades precisam existir no Núcleo:

**Transação (entidade nova no Núcleo) — NÃO bloqueante para MVP:**
- Entidade completa conforme seção 2.5. Será criada no Núcleo em paralelo ou após o lançamento do MVP.
- O app implementa a interface (rotas, UI) preparada para plugar quando disponível.
- Acesso via endpoints semânticos (confirmado).

**Parcelamento — campos de data para status de regularização:**
- `data_envio_projeto` — marca transição para "Em análise" (projeto urbanístico enviado)
- `data_aprovacao_conplan` — marca transição para "Aprovado" (aprovação CONPLAN)
- `data_decreto_gdf` — marca transição para "Registrado" (decreto GDF)

Nomes confirmados para o Núcleo (Rafael, 09/06).

**Parcelamento — campos de área:**
- `area_poligonal` — área total da poligonal do parcelamento
- `area_viario` — área de viário
- `area_servidao` — área de servidão
- `area_total_lotes` — campo direto ou calculado (somatória das áreas das unidades)

Rafael (24/05): Esses campos estarão como valores registrados direto na tabela do Parcelamento (edição ou fórmula) ou como fórmulas que venham da tabela de Unidades.

---

## 3. MVP — Escopo

### 3.1 Estratégia de lançamento — Transação como dependência não bloqueante

O MVP lança **sem** a entidade Transação implementada no Núcleo (Rafael, 13/06). O objeto Transação ainda não tem definição final no Núcleo e seu design será amadurecido em paralelo.

**O que o MVP entrega sem Transação:**
- Navegação territorial completa (SH → Parcelamento → Lote → Unidade)
- Gestão de Propostas (criação, aprovação, cascata, cópia/renovação)
- Dashboard de KPIs baseados em dados territoriais (áreas, contagens)
- Importação de dados do Planilhão (estrutura territorial + pessoas)
- Visualização de pessoas vinculadas a unidades (via Núcleo)

**O que fica preparado mas inativo até Transação existir no Núcleo:**
- Rotas de criação/aprovação de Transação (implementadas como proxy para `req.nucleo`, retornam erro informativo enquanto o endpoint do Núcleo não existir)
- UI de "Criar Transação" na página de Unidade (botão presente, desabilitado ou com mensagem "disponível em breve" até a integração estar ativa)
- KPIs de VGV (dependem de transações para cálculo — exibem zero ou mensagem até haver dados)
- Eventos de Transação (seção 5.2 — emitidos somente quando a integração estiver ativa)

**Benefício:** o app agrega valor imediato como fonte única da verdade territorial e de propostas comerciais. Transações são adicionadas como upgrade sem rewrite.

### 3.2 Escopo detalhado

**Entra no MVP:**
- Telas para criação/cadastro de todos os objetos:
  - Objetos estruturais (criação apenas por admin): Setor Habitacional, Parcelamento, Lote
  - Objetos editáveis (edição recorrente por criador): Unidade, Pessoa
  - Objetos operacionais (criação frequente por criador): Proposta (app). Transação preparada mas dependente do Núcleo.
- Dashboard com KPIs por parcelamento e setor: contagem de lotes, áreas. VGV quando Transação disponível.
- Lógica de propostas vigentes em cascata (Setor → Parcelamento → Unidade) via rotas customizadas
- Cálculo do valor da transação: preco_m2 × área da Unidade *(quando Transação disponível)*
- Fluxo de aprovação de Propostas: criadas com status "pendente", aprovadas por validador interno
- Campos modificado_em / modificado_por em todos os objetos (automáticos do framework / Núcleo)
- Interface nativa do UrbiVerso (componentes urbi-*)
- Importação inicial de dados do Planilhão via script determinístico (Max via API)
- App lança vazio, preparado para importação. Importação grande inicial + porta aberta para importações incrementais
- **Copiar Proposta** — botão para duplicar proposta existente (equivale a renovação)
- **Notificação automática** — alerta 24h antes quando Proposta Tabela de SH estiver se aproximando do vencimento (Rafael, 13/06)

**Fora do MVP:**
- Adesômetro / Status de Adesão (removido por Rafael, 27/05)
- Caucionamento e Prenotação como status de regularização (ficam em campo separado, futuro)
- Ações judiciais/extrajudiciais (v2)
- Índice econômico / correção monetária (futuro — quando Núcleo tiver infra para índices)
- Saldo devedor (vive em outra base, controle do financeiro)
- Geração automática de contratos (v3)
- Dados de engenharia e meio ambiente (v3)
- Permissões granulares além dos roles definidos
- Cenários de negociação/contra-proposta (v2)
- Contratos e Ações (não estão no Núcleo, fora de escopo)

---

## 4. Permissões

**Permissão padrão da app:** leitura (todos os usuários do UrbiVerso podem consultar)

**Roles customizáveis (3ª camada):**

- escrita / criador — Cria e edita Propostas. Registra Transações no Núcleo (quando disponível). Edita Unidades e Pessoas. Equipe do Dept. de Relacionamento.
- escrita / validador_interno — Aprova Transações e Propostas (pendente → aprovado/vigente). Gestores com alçada.
- escrita / editor_regularizacao — Edita campos de status de regularização dos Parcelamentos. Equipe de regularização.

**Regras:**
- Propostas são criadas por criador com status "pendente". Transações seguem o mesmo fluxo quando disponíveis.
- Só validador_interno pode aprovar
- Imutabilidade pós-aprovação: uma vez aprovada, Transação/Proposta não pode ser alterada. Somente admin pode intervir.
- Roles acumuláveis
- Criação de Setores Habitacionais, Parcelamentos e Lotes: somente admin
- Cadastro de Pessoas: criador
- Nível admin: gestão da app, importação, criação de objetos estruturais

**Membership (4ª camada):** Não necessário no MVP. Não há associação de usuários a objetos específicos.

**Permissões do Núcleo (manifesto):**
- `pessoas`: `ler`, `escrever`
- `imoveis`: `ler`
- `setores_habitacionais`: `ler`
- `parcelamentos`: `ler`
- `matriculas`: `ler`
- `transacoes`: `ler`, `escrever` *(declarada desde o início; funcional quando entidade existir no Núcleo)*

*(Nota: a app não cria/edita objetos estruturais do Núcleo diretamente — apenas leitura para imóveis, parcelamentos, setores e matrículas. Escrita em pessoas para vincular moradores e em transações para registrar contratos.)*

---

## 5. Eventos e Notificações

### 5.1 Eventos da App (Proposta)

**`app.reg360.proposta_criada`**
- **Trigger:** rota `POST /api/reg360/propostas` (após criação bem-sucedida)
- **Campos:** proposta_id, titulo, nivel, tipo_proposta, ref_nome, data_proposta, data_fim_vigencia, preco_m2, criador
- **Conteúdo:** `Nova proposta "{titulo}" ({tipo_proposta}) criada por {criador} para {ref_nome} — R$ {preco_m2}/m², vigência {data_proposta} a {data_fim_vigencia}`
- **API:** `propostas/{proposta_id}`
- **Rota:** `proposta/{proposta_id}`
- **Audiência:** Validadores internos (inscrição automática forte por role)
- **Inscrição automática:** ao atribuir role `validador_interno`, inscrever em `proposta_criada` com força `forte`

**`app.reg360.proposta_aprovada`**
- **Trigger:** rota `POST /api/reg360/propostas/:id/aprovar` (após aprovação)
- **Campos:** proposta_id, titulo, nivel, tipo_proposta, ref_nome, aprovador
- **Conteúdo:** `Proposta "{titulo}" ({tipo_proposta}) para {ref_nome} aprovada por {aprovador}`
- **API:** `propostas/{proposta_id}`
- **Rota:** `proposta/{proposta_id}`
- **Audiência:** Criador original da proposta + gestores
- **Inscrição automática:** ao criar proposta, inscrever criador em `proposta_aprovada` com filtro `{ "proposta_id": <id> }`, força `forte`

### 5.2 Eventos de Transação

⚠️ **Adiados até a implementação de Transação no Núcleo** (Rafael, 13/06).

Quando Transação existir no Núcleo, o app emitirá:
- `app.reg360.transacao_criada` — Trigger: rota de criação de transação (proxy para Núcleo). Campos: tipo, preco_m2, data_assinatura, unidade_id, pessoa_id. Audiência: Validadores internos.
- `app.reg360.transacao_aprovada` — Trigger: rota de aprovação (proxy para Núcleo). Campos: mesmos + aprovador_id. Audiência: Criador original + gestores.

**Alternativa:** Se o Núcleo emitir eventos próprios de Transação no barramento, o app se inscreve em vez de emitir. A decisão final será tomada quando a Transação for implementada no Núcleo. O código deve ser estruturado para suportar ambos os cenários.

### 5.3 Notificação Direta — Vencimento de Proposta Tabela

**Trigger:** rotina diária (framework de rotinas) — verifica Propostas de nível "setor" e tipo "tabela" cuja `data_fim_vigencia` está a **24 horas ou menos** do vencimento (Rafael, 13/06).
**Destinatário:** usuários com role `validador_interno`
**Método:** `req.notificacoes.notificar()` — notificação direta, sem evento no barramento.
**Mensagem:** `Proposta Tabela "{titulo}" do {nome_setor} vence em {horas} horas. Renove ou crie nova proposta.`
**Frequência:** notificação única (flag `notificacao_vencimento_enviada` na proposta ou controle em memória para evitar duplicatas).

**Regra de negócio:** Propostas Tabela de SH são a base mínima de precificação. Se vencerem sem substituta, toda a cascata perde a referência de preço. O alerta é preventivo.

---

## 6. Interface

Componentes nativos do UrbiVerso (urbi-*). Sem linguagem visual própria. Formulários de criação e visualização de objetos seguem padrões de UI do UrbiVerso (Rafael, 09/06).

### 6.1 Navegação Principal

**Abas de topo (urbi-abas):** Três abas na página principal do app:
- **Regularização** — página inicial/home
- **Parcelamentos** — listagem completa de todos os parcelamentos
- **Unidades** — listagem completa de todas as unidades

### 6.2 Página Inicial (aba "Regularização")

Layout: `urbi-grid` responsivo com **cards simples** representando cada Setor Habitacional (5 cards na Fazenda Paranoazinho). Cards clicáveis → navegam para a página de detalhe do SH.

Cada card exibe dados-resumo do SH (nome, KPIs agregados).

### 6.3 Abas Parcelamentos e Unidades

Ambas usam `urbi-tabela` com filtros por coluna para listagem e busca. Colunas exibem dados principais vindos do Núcleo. Linhas clicáveis → navegam para a página de detalhe do respectivo objeto.

### 6.4 Página de Detalhe — Setor Habitacional

**Topo:** Nome do SH + KPIs em grid auto-fit (`urbi-kpi`):
- Área Lotes Privativos (m²) — somatória das áreas das unidades do SH
- VGV (R$) — somatória dos valores das transações vinculadas a unidades do SH *(exibido quando Transação disponível)*

**Status de regularização:** Filtros por status usando `urbi-badge` (Irregular, Em Análise, Aprovado, Registrado).

**Abas inferiores:**
1. **Empreendimentos** (Parcelamentos) — `urbi-tabela` com colunas: Nome, Área Poligonal, Área Total Lotes, Status Regularização (urbi-badge). Ação "Ir para condomínio" por linha.
2. **Propostas Vigentes** — `urbi-stack` com cards expansíveis mostrando propostas vigentes vinculadas ao SH. Botão "Criar Proposta" (`urbi-botao`). Botão "Copiar Proposta" em cada card de proposta existente.

### 6.5 Página de Detalhe — Parcelamento

Mesmo padrão do SH:
- **Topo:** Nome + KPIs (`urbi-kpi` grid auto-fit) — áreas, quantidades, percentuais, valores em R$
- **Status:** `urbi-badge` para status de regularização
- **Abas inferiores:**
  1. **Unidades** — `urbi-tabela` com lista de unidades contidas no parcelamento
  2. **Propostas Vigentes** — `urbi-stack` + botão criar proposta + botão copiar

### 6.6 Página de Detalhe — Unidade

- **Topo:** Identificação + KPIs (`urbi-kpi`)
- **Campos variáveis:** texto, número, currency (R$), percentual, data — todos visualizáveis
- **Abas:**
  1. **Propostas Vigentes** — única aba por enquanto. `urbi-stack` com propostas vigentes (cascata resolvida) + botão criar proposta
  2. **Transações** *(preparada, ativada quando Transação existir no Núcleo)* — listagem de transações da unidade + botão "Criar Transação"
- **Changelog:** `urbi-lista-alteracoes` com histórico de alterações (dados do Núcleo + app). Integração com fontes externas (CRM, atendimento) fica para v2.

### 6.7 Formulários

- **Criação de Proposta:** `urbi-botao` → formulário com `urbi-input`. Campos com regras de validação. Tipos: texto, número, data, valor R$, percentual, single-select.
- **Cópia de Proposta:** Pré-preenche formulário de criação com dados da proposta original. Usuário ajusta datas/valores e salva como nova proposta.
- **Criação de Transação:** formulário similar, vinculando Unidade + Pessoa + Proposta opcional. Dados persistem no Núcleo via endpoints semânticos. *(Disponível quando Transação existir no Núcleo.)*

### 6.8 Componentes Utilizados (resumo)

- `urbi-abas` — Navegação principal (3 abas) e abas em páginas de detalhe
- `urbi-grid` — Cards de SH na home (responsivo)
- `urbi-kpi` — KPIs no topo das páginas de detalhe (grid auto-fit)
- `urbi-tabela` — Listagens de parcelamentos, unidades, com filtros por coluna
- `urbi-badge` — Status de regularização, tipos, categorias
- `urbi-stack` — Propostas vigentes com cards expansíveis
- `urbi-botao` — Ações (criar proposta, copiar proposta, criar transação, navegar)
- `urbi-input` — Formulários de criação/edição
- `urbi-lista-alteracoes` — Changelog na Unidade
- `urbi-shell-page` — Container de página

### 6.9 Páginas e Rotas Públicas

**Decisão:** Não há páginas públicas neste app. Todo acesso requer autenticação no UrbiVerso. Dados de regularização fundiária são internos da UP.

---

## 7. Migração de Dados

**Fonte única:** Planilhão (Excel, ~6.000 linhas). O Airtable é incompleto e não será usado como fonte.

**Estratégia de importação:**
- App lança vazio, preparado para receber dados externos
- Importação inicial grande via script determinístico (API)
- Porta aberta para importações incrementais (dados podem ter erros/duplicações)
- Rafael unifica fontes antes da importação
- Não há conferência com dados externos — Dashboard mostra os cálculos a partir dos dados importados

**Mapeamento Planilhão → Núcleo + App:**
- Endereço, QD, CJ, LT, Área, Matrícula, Uso, Tipo Lote → Lote (Núcleo)
- Parcelamento (PAR), Setor → Parcelamento, Setor Habitacional (Núcleo)
- Morador(es), CPF/CNPJ, Telefones, Emails → Pessoa (Núcleo)
- Status do Planilhão indica tipo de Transação: "Contratado" → Pré-Contrato, "CP" → CP, "Vendido" → Escritura, "Estoque" → sem transação

**Nota MVP:** Dados de Transação do Planilhão só podem ser importados quando a entidade Transação existir no Núcleo. A importação territorial (SH, Parcelamentos, Lotes, Unidades, Pessoas) pode ser feita imediatamente.

**Regra:** Quando ambas "Data 1ª escritura ou CP" e "Data escritura (casos CP)" estão preenchidas = duas transações (1ª CP, 2ª Escritura).

---

## 8. Regras de Negócio

Consolidação das regras de negócio discutidas e confirmadas:

**RN-01 — Cascata de Propostas:** A proposta vigente de uma Unidade é resolvida subindo a hierarquia: Unidade → Parcelamento → Setor. A mais específica prevalece. Se não há proposta vigente no nível, sobe.

**RN-02 — Proposta Tabela de SH sempre vigente:** Propostas de nível "setor" com tipo "tabela" nunca podem ficar com status diferente de Vigente. Notificação automática 24h antes do vencimento (Rafael, 13/06).

**RN-03 — Imutabilidade pós-aprovação:** Transação ou Proposta aprovada não pode ser alterada. Somente admin pode intervir.

**RN-04 — Fluxo de aprovação:** Propostas são criadas com status "pendente". Só role `validador_interno` pode aprovar. Após aprovação, status muda para "aprovada" e passa a ser considerada vigente (se dentro das datas). Transações seguem o mesmo fluxo quando disponíveis.

**RN-05 — Cálculo de Valor:** Valor da Unidade na Transação = preco_m2 × Área (Unidade no Núcleo). VGV = somatória dos valores das unidades com transação. *(Funcional quando Transação disponível.)*

**RN-06 — Compatibilidade informativa:** Ao criar transação, alerta visual se o preço/m² difere do preço da proposta vigente. Informativo, não bloqueio.

**RN-07 — Status de regularização:** Calculado automaticamente a partir dos campos de data no Parcelamento (Núcleo). Ordem inversa: Registrado > Aprovado > Em análise > Irregular.

**RN-08 — Copiar Proposta:** Permite duplicar proposta existente como nova (renovação). Nova proposta nasce com status "pendente", mesmo que a original fosse "aprovada".

**RN-09 — Graceful degradation (Transação):** Funcionalidades que dependem de Transação no Núcleo devem degradar graciosamente — UI informa que a feature estará disponível em breve, rotas retornam erro semântico (`501` ou `503`), KPIs dependentes exibem placeholder.

### 8.1 Fluxos Principais

**Fluxo 1 — Criar e Aprovar Proposta:**
1. Criador acessa Setor/Parcelamento/Unidade → clica "Criar Proposta"
2. Preenche formulário (titulo, tipo, preço, datas, descontos)
3. Proposta criada com status "pendente" → evento `proposta_criada`
4. Validador interno recebe notificação → acessa proposta → aprova
5. Status muda para "aprovada" → evento `proposta_aprovada`
6. Se dentro das datas de vigência → proposta entra na cascata como vigente

**Fluxo 2 — Registrar Transação** *(disponível quando Transação existir no Núcleo):*
1. Criador acessa Unidade → clica "Criar Transação"
2. Preenche formulário (tipo, pessoa, preço/m², forma pagamento)
3. Sistema exibe proposta vigente + alerta de compatibilidade
4. Transação criada no Núcleo com status "pendente" → evento `transacao_criada`
5. Validador interno recebe notificação → aprova
6. Status "aprovada" → VGV atualizado

**Fluxo 3 — Renovar Proposta (Copiar):**
1. Usuário acessa proposta existente → clica "Copiar Proposta"
2. Formulário pré-preenchido com dados da original
3. Ajusta datas, valores conforme necessário
4. Nova proposta criada com status "pendente" → segue fluxo 1

---

## 9. Webhooks

**Decisão:** Não há webhooks neste MVP. O app não precisa receber callbacks de sistemas externos. A importação de dados é feita via script com acesso direto à API. Se integração com sistemas externos for necessária no futuro (ex: cartório digital, IBGE para índices), webhooks podem ser adicionados.

---

## 10. Rotas Customizadas

Operações que exigem lógica de negócio além do CRUD genérico:

| Rota | Método | Descrição | Justificativa |
|------|--------|-----------|---------------|
| `/api/reg360/propostas` | POST | Criar proposta | Valida role `criador`, preenche status_aprovacao="pendente", publica evento `proposta_criada` |
| `/api/reg360/propostas` | GET | Listar propostas | Filtros por nivel, ref_id, status_aprovacao, vigência |
| `/api/reg360/propostas/:id` | GET | Detalhe da proposta | Inclui dados do objeto alvo (SH/Parcelamento/Unidade via Núcleo) |
| `/api/reg360/propostas/:id` | PATCH | Editar proposta | Bloqueia se status_aprovacao="aprovada" (RN-03) |
| `/api/reg360/propostas/:id/aprovar` | POST | Aprovar proposta | Valida role `validador_interno`, muda status, publica evento `proposta_aprovada` |
| `/api/reg360/propostas/:id/copiar` | POST | Copiar proposta | Cria nova com mesmos dados, status "pendente" (RN-08) |
| `/api/reg360/propostas/vigente` | GET | Resolver cascata | Params: `nivel`, `ref_id`. Retorna a proposta vigente aplicável (própria ou herdada por cascata) |
| `/api/reg360/dashboard/setor/:id` | GET | KPIs do Setor | Agrega: contagem lotes, áreas. VGV quando Transação disponível. Cross-schema (app + Núcleo) |
| `/api/reg360/dashboard/parcelamento/:id` | GET | KPIs do Parcelamento | Mesmo padrão, escopo parcelamento |
| `/api/reg360/transacoes` | POST | Criar transação | Proxy para Núcleo (`req.nucleo`), valida role `criador`, publica evento se Núcleo não publicar. ⚠️ Retorna 501 até Transação existir no Núcleo. |
| `/api/reg360/transacoes/:id/aprovar` | POST | Aprovar transação | Proxy para Núcleo, valida role `validador_interno`. ⚠️ Retorna 501 até Transação existir no Núcleo. |

A tabela `propostas` usa `acesso_externo: "restrito"` — todo CRUD passa pelas rotas acima.

---

## 11. Artefatos Formais

### 11.1 schema.json

```json
{
  "tabelas": {
    "propostas": {
      "colunas": {
        "titulo":                      { "tipo": "texto", "limite": 200, "obrigatorio": true },
        "descricao":                   { "tipo": "texto_longo" },
        "nivel":                       { "tipo": "texto", "limite": 20, "obrigatorio": true, "opcoes": ["setor", "parcelamento", "unidade"] },
        "tipo_proposta":               { "tipo": "texto", "limite": 30, "obrigatorio": true, "opcoes": ["tabela", "campanha", "negociacao_coletiva"] },
        "ref_id":                      { "tipo": "inteiro", "obrigatorio": true },
        "data_proposta":               { "tipo": "data", "obrigatorio": true },
        "data_fim_vigencia":           { "tipo": "data", "obrigatorio": true },
        "status_aprovacao":            { "tipo": "texto", "limite": 20, "obrigatorio": true, "padrao": "pendente", "opcoes": ["pendente", "aprovada"] },
        "aprovado_por_id":             { "tipo": "referencia", "tabela_ref": "shell.usuarios", "campos_incluir": ["nome as aprovador_nome"] },
        "preco_m2":                    { "tipo": "decimal", "precisao": 12, "escala": 2, "obrigatorio": true },
        "preco_minimo_residencial":    { "tipo": "decimal", "precisao": 12, "escala": 2 },
        "preco_minimo_comercial_misto":{ "tipo": "decimal", "precisao": 12, "escala": 2 },
        "desconto_a_vista":            { "tipo": "decimal", "precisao": 5, "escala": 2 },
        "desconto_6x":                 { "tipo": "decimal", "precisao": 5, "escala": 2 },
        "desconto_12x":                { "tipo": "decimal", "precisao": 5, "escala": 2 },
        "desconto_lote_grande":        { "tipo": "decimal", "precisao": 5, "escala": 2 },
        "lote_grande_m2":              { "tipo": "decimal", "precisao": 10, "escala": 2 }
      },
      "unicos": [["nivel", "ref_id", "data_proposta"]],
      "soft_delete": true,
      "acesso_externo": "restrito"
    }
  }
}
```

### 11.2 manifesto.json

```json
{
  "nome": "Regularização 360",
  "versao": "1.0.0",
  "descricao": "Gestão do ciclo de vida da regularização fundiária — propostas comerciais, acompanhamento de transações e dashboard de status.",
  "permissao_padrao": "leitura",
  "roles": {
    "escrita": {
      "criador": "Cria e edita Propostas. Registra Transações no Núcleo. Edita Unidades e Pessoas.",
      "validador_interno": "Aprova Transações e Propostas pendentes, mudando status para vigente.",
      "editor_regularizacao": "Edita campos de status de regularização dos Parcelamentos."
    }
  },
  "eventos": {
    "proposta_criada": {
      "campos": ["proposta_id", "titulo", "nivel", "tipo_proposta", "ref_nome", "data_proposta", "data_fim_vigencia", "preco_m2", "criador"],
      "conteudo": "Nova proposta \"{titulo}\" ({tipo_proposta}) criada por {criador} para {ref_nome} — R$ {preco_m2}/m²",
      "api": "propostas/{proposta_id}",
      "rota": "proposta/{proposta_id}"
    },
    "proposta_aprovada": {
      "campos": ["proposta_id", "titulo", "nivel", "tipo_proposta", "ref_nome", "aprovador"],
      "conteudo": "Proposta \"{titulo}\" para {ref_nome} aprovada por {aprovador}",
      "api": "propostas/{proposta_id}",
      "rota": "proposta/{proposta_id}"
    }
  },
  "rotinas": {
    "verificar_vencimento_propostas": {
      "titulo": "Verificar vencimento de Propostas Tabela",
      "descricao": "Verifica se Propostas Tabela de SH estão a 24h ou menos do vencimento e notifica validadores.",
      "frequencia": "diaria"
    }
  },
  "dependencias_nucleo": [
    "pessoas",
    "imoveis",
    "setores_habitacionais",
    "parcelamentos",
    "matriculas",
    "transacoes"
  ],
  "permissoes_nucleo": {
    "pessoas": ["ler", "escrever"],
    "imoveis": ["ler"],
    "setores_habitacionais": ["ler"],
    "parcelamentos": ["ler"],
    "matriculas": ["ler"],
    "transacoes": ["ler", "escrever"]
  }
}
```

---

## 12. Documentação

### 12.1 Documentações obrigatórias antes da implementação

O implementador deve ler as seguintes documentações do framework antes de iniciar:
- `docs/shell/banco-de-dados.md` — framework de dados (schema.json, tipos de coluna, acesso_externo, req.dados)
- `docs/shell/barramento.md` — framework de eventos (manifesto, req.eventos, inscrições, notificações)
- `docs/shell/permissoes.md` — sistema de permissões (camadas, roles, nivelApp)
- `docs/shell/nucleo.md` — dados compartilhados (Party Pattern, endpoints semânticos, req.nucleo)
- `docs/shell/ui-componentes-conteudo.md` — componentes de conteúdo (urbi-kpi, urbi-tabela, urbi-badge, etc.)
- `docs/shell/ui-componentes-layout.md` — componentes de layout (urbi-shell-page, urbi-abas, urbi-grid)
- `docs/shell/documentacao.md` — framework de documentação (obrigatório para criar docs do app)
- `docs/shell/rotinas.md` — framework de rotinas (para a rotina de verificação de vencimento)

### 12.2 Estrutura de documentação do app

O app deve criar a seguinte documentação seguindo o framework de documentação do UrbiVerso (`docs/shell/documentacao.md`):

- `docs/reg360/visao-geral.md` — visão geral e propósito do app
- `docs/reg360/modelo-dados.md` — modelo de dados (schema, relações, campos do Núcleo consumidos)
- `docs/reg360/propostas-cascata.md` — lógica de propostas em cascata e regras de vigência
- `docs/reg360/fluxos.md` — fluxos de aprovação, criação de transação, dashboard
- `docs/reg360/importacao.md` — guia de importação de dados do Planilhão

Cada arquivo deve seguir o template e convenções do framework de documentação.

---

## Questões Resolvidas

1. ~~**Transação N:1 com Unidade**~~ — **RESOLVIDO (Rafael, 03/06 e 08/06).** Múltiplas transações por Unidade.

2. ~~**Campos de status de regularização**~~ — **RESOLVIDO (Rafael, 08/06).** 4 estágios com campos de data. Nomes confirmados para o Núcleo (Rafael, 09/06).

3. ~~**Ciclo de vida de Propostas**~~ — **RESOLVIDO (Rafael, 09/06).** Proposta vencida torna-se não vigente, cascata sobe automaticamente. Copiar Proposta = renovação. Proposta Tabela de SH nunca fica sem vigência (notificação automática 24h antes).

4. ~~**Vigência e Cascata**~~ — **RESOLVIDO (Rafael, 09/06).** Cascata sobe para o Setor quando não há proposta vigente nos níveis inferiores. Sempre há proposta vigente no SH (Tabela obrigatória), garantindo que nenhuma unidade fica sem referência de preço.

5. ~~**Transação no MVP**~~ — **RESOLVIDO (Rafael, 13/06).** MVP lança sem Transação no Núcleo. App prepara interfaces/rotas para integração futura. Valor imediato via gestão territorial + propostas.

6. ~~**Timing de notificação de vencimento**~~ — **RESOLVIDO (Rafael, 13/06).** Alerta 24h antes da data de vencimento da Proposta Tabela de SH.
