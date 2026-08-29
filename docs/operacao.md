---
titulo: Operação e Deploy
descricao: Build, registro e checklist de ativação do reg360 numa instância.
tipo:
---

# Operação e deploy

## Versão

`manifesto.json` e `package.json` carregam a mesma versão, e **o workflow de release recusa a tag se ela não bater com o manifesto** — divergência entre os dois não passa despercebida.

A versão atual é **0.9.0**. O salto de `0.1.1` não é cosmético: entre uma e outra, o app trocou o objeto de navegação, ganhou cinco tabelas, seis telas e a lógica pura que sustenta todas elas.

**Por que não `1.0.0`:** o app ainda não rodou em instância nenhuma. `1.0.0` é o número **depois** do QA na Pinguim confirmar que ele funciona com o dado real — não antes. O `0.9` também espelha a linhagem da spec, que era v0.9 mirando a v1.0.

## Homologação: a release nasce NÃO homologada

**"Homologada" não é campo do manifesto nem do tarball** — é o campo **nativo `prerelease` do GitHub Release**, lido pelo shell:

| `prerelease` no GitHub | Como a instância mostra |
|---|---|
| `true` | **não homologada** |
| `false` | homologada |

O workflow publica **sempre com `--prerelease`**. Homologar é **ato de quem atesta**, não propriedade do build — o build não sabe se foi testado. Antes disso o `gh release create` omitia a flag, e o default do GitHub (`false`) fazia toda release nascer homologada por omissão, não por escolha.

Promover uma release depois de validá-la:

```bash
gh release edit reg360-v<x.y.z>_<sha8> --prerelease=false
```

### O passo que falha calado

**O app precisa estar com `Nível de aceitação = Releases`** em `Admin → Apps → reg360 → Upgrades`. O padrão da plataforma é `homologado`, e com ele o filtro age em dois momentos diferentes:

| Caminho | Nível usado | Com a release não homologada |
|---|---|---|
| **Listagem** — o modal "Atualizar" | sempre `releases` | **aparece** |
| **Aplicar**: atualizar do repositório, auto-update | o nível do app | **descartada** se for `homologado` |

Ou seja: no padrão, a release **aparece no modal e é recusada na hora de aplicar**. O sintoma é uma versão que se oferece e não instala, sem dizer o motivo.

Trocar o nível é reservado ao **administrador pleno da instância** — está na mesma tela dos upgrades.

Esse é justamente o desenho do filtro: a instância intermediária fica em `Releases` e recebe tudo; produção fica em `homologado` e só recebe o que alguém atestou.

## Build e registro

```bash
# na pasta da app
pnpm install
pnpm build            # esbuild: frontend/index.js + backend/rotas.js

# na raiz do monorepo
npm run registrar     # regenera apps.json (o shell descobre a app)
```

`apps.json`, `frontend/index.js` e `backend/rotas.js` são gerados (gitignored). O shell monta o backend em `/api/reg360/`, cria o schema `reg360` e sincroniza a tabela `propostas` no boot.

## Checklist de ativação (admin da instância)

1. **Registrar e subir** a app (build + `registrar` + restart do shell).
2. **Habilitar flags de Núcleo** em `Admin → Apps → reg360 → Núcleo` (começam desligadas). Quem liga é quem tem a alçada `nucleo`, ou o sysadmin pleno.

   Cada flag pedida tem pelo menos um chamador no código — o manifesto não pede nada "por precaução", porque pedido a mais vira toggle que alguém liga sem saber por quê:

   | Entidade | Flags | Quem exige |
   |---|---|---|
   | `setores_habitacionais` | `ler` | home e detalhe do Setor; busca de setor pelo importador |
   | `parcelamentos` | `ler`, `escrever` | navegação lê; o importador cria parcelamento por slug |
   | `imoveis` | `ler`, `escrever` | listagem de lotes e unidades lê; o importador cria lote. **Lote e unidade são subtipos** — a flag se pede no supertipo `imoveis`, nunca em `lotes`/`unidades` |
   | `incorporacoes` | `ler` | detalhe do Lote resolve o nome da incorporação e lista as unidades dela |
   | `matriculas` | `ler`, `escrever` | o importador cria matrícula por número |
   | `pessoas` | `ler`, `escrever` | o importador cria pessoa física por CPF |

   Sem a flag ligada, o endpoint responde `403 NUCLEO_FLAG_DESLIGADA` — sintoma de admin que não ligou o toggle, não de bug da app. `403 NUCLEO_FLAG_NAO_PEDIDA` é o outro caso: o manifesto não declarou, e aí é bug da app.
3. **Confirmar permissão padrão** do app = `leitura` (todos consultam).
4. **Atribuir papéis** em `Configurações → Usuários`: `criador`, `validador_interno`, `editor_regularizacao` aos usuários certos.
5. **Rotina** `checar_propostas_vencendo` — conferir em `Config → Rotinas` (frequência diária; horário no fuso da organização; toggle ativa; "Rodar agora" para testar).
6. **Importação inicial** — ver [importacao.md](importacao) (setores pré-criados via `editor_nucleo`; dry-run → executar).

## Dependência externa — Transação

A entidade **ainda não existe no Núcleo**, e o app está preparado num adaptador de três arquivos com interruptor único. A aba Transações explica o que falta em vez de mostrar botão morto; as rotas respondem `501` com código semântico.

**O VGV não depende disso** — ele é calculado e aparece hoje. (Este doc afirmava o contrário até o PR #58; a afirmação vinha do desenho original, em que o VGV sairia de contratos assinados.)

O roteiro do dia da virada — o que ligar, em que ordem, e o que **não** fazer com o `preco_estatico` — está em [transacao-integracao.md](transacao-integracao).

## As duas tabelas 1:1 e a corrida do upsert

`parcelamento_dados` (um registro por parcelamento) e `imovel_dados` (um por imóvel) **nascem na primeira escrita** — a maioria dos objetos do Núcleo nunca foi editada e não tem linha nenhuma aqui. Toda gravação nelas é, portanto, um upsert por chave natural.

O padrão ingênuo — `listar`, e então `criar` ou `atualizar` — tem uma janela, e **envolvê-lo numa transação não a fecha**: um `SELECT` comum não trava linha que ainda não existe, então duas requisições simultâneas podem as duas não achar nada e as duas tentarem inserir. A segunda espera no índice único e falha com violação; o usuário vê um erro de banco em vez de ver o seu dado salvo.

Por isso as duas rotas passam por `upsertPorChave` (`backend/upsert.ts`), que **assume a corrida**: perder o INSERT é resposta esperada, não erro. Quem perde relê e atualiza o registro que o concorrente acabou de criar — uma tentativa só de recuperação, porque se a segunda leitura também não achar nada, o erro é outro e precisa subir.

Quem adicionar uma terceira tabela 1:1 com o Núcleo usa a mesma função, em vez de repetir o laço.

## Testes

```bash
pnpm test          # node --import tsx/esm --test backend/__tests__/*.test.ts
```

Cobrem a lógica pura de `comum/` (vigência e cascata, paginação, busca, preço, agregados, regularização) e o `upsertPorChave` do backend, com um helper de dados falso que simula o índice único. A verificação end-to-end (rotas de verdade, render, leitura do Núcleo) exige o shell rodando contra Postgres.
