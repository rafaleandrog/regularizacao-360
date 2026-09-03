# CLAUDE.md — Regularização 360 (`reg360`)

App UrbiVerso de regularização fundiária da Fazenda Paranoazinho, em repositório próprio. Distribuída como `.urbiapp.tgz` via GitHub Release e instalada por `Admin → Apps`.

## Rastreabilidade de issue — a regra que mais falha calada

**Todo PR fecha suas issues pela keyword, e depois do merge alguém confere que elas fecharam.**

O GitHub vincula PR→issue exclusivamente por `close`/`closes`/`closed`, `fix`/`fixes`/`fixed`, `resolve`/`resolves`/`resolved`. Três detalhes falham **sem erro nenhum**:

- **`Fecha #12` não fecha nada.** Só a keyword em inglês vale. O PR mergeia, a issue fica aberta, e ninguém percebe — a falha é ausência, não erro.
- **A keyword repete por issue.** `Closes #1, #2` fecha **só a #1**. Escreva `Closes #1, closes #2`.
- **Só vale no corpo do PR ou na mensagem de commit** — nunca no título.

Por isso a conferência é obrigatória e não opcional: **depois de mergear, liste as issues fechadas e confirme**, em vez de assumir. Um `Closes` que não disparou é indistinguível de um que disparou, até alguém contar.

### Quando a entrega é parcial

Issue meio-feita **continua aberta**, com um comentário dizendo exatamente **o que falta e por quê**. O PR then declara só as issues que fecha de fato.

Fechar uma issue "porque a maior parte foi" é como o backlog vira ficção: a metade que faltou some, e o próximo a ler acha que está pronto.

### Quando o trabalho chega antes da issue

Às vezes um PR resolve, de passagem, parte de uma issue de outra onda — porque a tela precisava daquilo para funcionar. Nesse caso, **comente na issue antecipada** dizendo o que já existe e o que sobrou.

Sem esse comentário, quem pega a issue depois reimplementa o que já está no ar, ou pior: cria uma segunda fonte da verdade para a mesma conta.

### O que não entra num PR

Controle que só falha é pior que controle ausente:

- **Botão que a API vai recusar.** Se o schema ainda não aceita o valor, não ofereça o botão — deixe uma linha dizendo onde fazer, e a issue que o habilita.
- **Link para tela que não existe.** Chip clicável sem destino é defeito, não adiantamento.

Nos dois casos, registre no corpo do PR o que ficou de fora e qual issue entrega.

## Verificação antes de pedir merge

```bash
pnpm install && pnpm typecheck && pnpm test && pnpm build
```

Os quatro limpos, e o CI de PR verde. O CI roda `.github/workflows/ci.yml`; o release é outro workflow, disparado por tag.

**Documentação anda no mesmo PR que o código.** Mudou comportamento, mudou `docs/`. Feature sem doc não está completa.

**Capacidade de API sem controle na tela não entra** — e vice-versa. Endpoint com parâmetro que nenhuma tela usa é feature invisível: ninguém descobre, ninguém testa, e ela apodrece divergindo do que a tela faz.

## O que morde quem chega agora

**O `@urbiverso/sdk` é privado.** Instalar exige PAT *classic* com `read:packages` (o registry do GitHub não autentica fine-grained). Sem ele, `pnpm install` falha e leva junto `typecheck`, `test` e `build`. No CI, o segredo `URBIVERSO_PACKAGES_TOKEN` resolve.

**`backend/rotas.ts` precisa de `import '@urbiverso/sdk/express'`.** A augmentation que tipa `req.dados`, `req.contexto`, `req.eventos` e `req.shell` é opcional e **não vem pelo barrel**. Sem a linha, o `tsc` acusa dezenas de `Property 'dados' does not exist on type 'Request'`.

**O piso de plataforma se mede contra o SDK publicado**, nunca contra o `main` do monorepo — que está sempre à frente do que foi cunhado. `shell_min` e `sdk_min` no `manifesto.json` são pisos independentes e cumulativos.

Isso vale para **cada verbo que você chama**, não só para o número do piso. Ler `sdk/src/contrato.ts` no `main` do monorepo e usar o que estiver lá derruba o CI: `req.dados.varrerTudo` existe no `main` e **não** no SDK que esta app compila contra — o PR #48 nasceu vermelho exatamente assim. Se um verbo não está no bundle instalado, ele **não existe para a app**, e a pergunta certa é "quando isso é publicado?", não "deixa eu ver no shell". Quem verifica com stub tem o mesmo dever: o stub espelha o **publicado**, senão aprova o que o CI reprova.

**Teste de app é na instância intermediária** (Pinguim), nunca na de desenvolvimento: ela roda build não homologado, e aviso de obsolescência lido lá é sinal errado.

## Três restrições do Núcleo que decidem o desenho das telas

> **Reconferidas em 2026-09-02 contra o `@urbiverso/sdk` 52.0.0 publicado — as três continuam valendo.** Datadas de 2026-08; a data de conferência é o que vale, não a de escrita. Refazer a conferência a cada nível novo de SDK, contra o bundle publicado — nunca contra o `main` do monorepo.

Detalhadas em [`docs/leitura-nucleo.md`](docs/leitura-nucleo.md). Em resumo:

1. **`req.nucleo` não lê.** Só `batch`, `chamarSubrecurso`, `atualizar` e `buscarPorChave`. Toda agregação é no **frontend**.
2. **Sem leitura em lote por lista de ids.** `GET /matriculas` não filtra por id; `imovel_pessoas` só existe em `GET /lotes/:id/pessoas`. Daí a varredura memorizada e a janela de concorrência.
3. **Filtro fora da allowlist é ignorado em silêncio**, não rejeitado. `GET /unidades?parcelamento_id=N` devolvia a instância inteira — a coluna nem existe.

**O objeto de navegação é o Lote, não a Unidade.** No Núcleo, `unidades.incorporacao_id` é NOT NULL: unidade só existe sob incorporação. A premissa da spec v0.9 de que "todo lote gera 1 unidade default" nunca virou realidade.

**Não reimplemente o que o Núcleo entrega pronto**: `id_legivel`, `cpf_formatado`, `telefone_formatado`, `area_efetiva`, status derivado. Remontar cria uma segunda verdade que diverge.

## O Núcleo da Pinguim vai ser atualizado — releia isto antes de continuar

**O Ricardo vai atualizar o Núcleo da instância intermediária.** Depois disso, várias decisões deste app deixam de ser contorno e viram escolha — mas só depois de **conferir**, não de supor.

Boa parte do desenho atual existe para driblar limitações do Núcleo que valiam em 2026-08. Se elas caírem, o contorno vira dívida. Confira estas cinco antes de tocar em qualquer coisa:

| O que conferir | Se mudou, revisita |
|---|---|
| ~~`uso` e `tipo_lote` chegaram no payload do **Lote**?~~ **Decisão reaberta, não mais em espera** (2026-09-03) | O Ricardo decidiu não esperar: `imovel_dados.uso` foi criado (#19/#20/#21), aceitando conscientemente uma segunda fonte da verdade até o Núcleo entregar o campo. Se um dia `uso` chegar no payload do Lote, **isto vira migração de dado** (backfill de `imovel_dados.uso` a partir do Lote, e a app passa a ler de lá) — não é mais "implementar do zero". `tipo_lote` continua sem coluna: é sempre derivado do Uso (`tipoLoteDeUso()`) |
| ~~Existe rota de **pessoa → imóveis**?~~ **Não existe** (SDK 52) | Conferido em 2026-09-02. `imovel_pessoas` só é alcançável por `GET /{lote\|gleba\|unidade}/:id/pessoas` — imóvel → pessoas, nunca o inverso. A tela de Moradores continua justificada como está: recorte escolhido pelo usuário, e três estados de situação em vez de dois. Ver `docs/moradores.md` |
| ~~`GET /pessoas` expande **contatos** na listagem?~~ **Não expande** (SDK 52) | Conferido em 2026-09-02. Contato é sub-recurso (`/pessoas/fisicas/:id/{emails,telefones}`); a listagem unificada não o traz. A requisição por linha para telefone e email continua necessária |
| `parcelamentos.setor_habitacional_id` e `lotes.parcelamento_id` estão **preenchidos**? | É a #13. Se estiverem nulos, a navegação não anda e a Onda 1 vira importação antes de tela |
| ~~A entidade **Transação** existe?~~ **Existe** (SDK 52) | Conferido. O adaptador está pronto e desligado; ligar é a **#80** — e o catálogo de tipos do app precisa bater com `GET /transacoes/tipos` antes, senão o badge de estágio some calado. Roteiro em `docs/transacao-integracao.md` |

**Duas coisas que NÃO relaxam com a atualização:**

1. **A referência continua sendo o SDK publicado**, não o `main` do monorepo nem o que a Pinguim roda. Instância atualizada não significa SDK cunhado — e usar verbo que só existe no `main` já derrubou o CI aqui (o `varrerTudo` do PR #48).
2. **Filtro fora da allowlist continua sendo ignorado em silêncio** até prova em contrário. O importador só é seguro porque confere o que voltou (`casaComChave`); não tire essa guarda porque "agora o Núcleo é novo".

**Quatro das cinco já estão resolvidas** (Transação, pessoa → imóveis, contatos na listagem, e Uso/Tipo de Lote — reaberta e decidida, não mais em espera do Núcleo). **Sobra uma, e ela não é de contrato: é de dado** — se `parcelamentos.setor_habitacional_id` está preenchido. Só a instância responde, e é a #13.

O que fica esperando essa atualização: **#40** (release, instalação e QA — a skill `qa` precisa das variáveis `URBIVERSO_QA_*` no ambiente da sessão) e as issues da tabela acima.

## Release nasce não homologada — decisão permanente

**O workflow publica sempre com `--prerelease`.** No shell, "homologada" é o campo nativo `prerelease` do GitHub Release: `true` = não homologada. Homologar é **ato de quem atesta**, não propriedade do build.

Não reverta isso "porque a release não instalou". Se ela não instalou, o que falta é o **`Nível de aceitação = Releases`** no app da instância — no padrão (`homologado`), a release aparece no modal e é descartada ao aplicar. Ver `docs/operacao.md` § Homologação.

## Escopo

O monorepo `urbiverso/urbiverso` é **somente leitura** para este trabalho. Campo que falta no Núcleo vira tabela no schema `reg360`, com referência lógica por id — nunca FK.
