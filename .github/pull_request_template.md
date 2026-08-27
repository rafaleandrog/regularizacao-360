## O que muda

<!-- Uma linha: o que este PR entrega. -->

## Por quê

<!-- O problema que resolve. Se fecha issue, o contexto já está lá — resuma. -->

## Issues

<!-- ATENÇÃO: só keyword em INGLÊS fecha issue. `Fecha #1` não fecha nada.
     A keyword repete por issue: `Closes #1, closes #2` — `Closes #1, #2` fecha só a #1.
     E só vale no CORPO do PR ou na mensagem de commit, nunca no título. -->

Closes #

## Como testar

<!-- Comandos e o caminho na tela. -->

```bash
pnpm install && pnpm typecheck && pnpm test && pnpm build
```

## Depois de mergear

- [ ] Conferi que as issues declaradas **realmente fecharam** (a keyword falha sem erro).
- [ ] Issue entregue pela metade continua aberta, com comentário dizendo o que falta.
- [ ] Comentei em issue de outra onda cujo escopo este PR antecipou, se houve.

## Docs

<!-- Qual doc do app foi atualizado NESTE PR. Doc e código andam juntos:
     feature sem doc não está completa. Se nada mudou de comportamento, escreva "n/a". -->
