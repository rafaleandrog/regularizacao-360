import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ABAS_TOPO } from '../../comum/navegacao.js';

const manifesto = JSON.parse(readFileSync(new URL('../../manifesto.json', import.meta.url), 'utf8'));

test('o nav do manifesto e as abas da tela são a mesma lista', () => {
  // Amarra por CONTAGEM EXATA e item a item: entrada a mais e entrada a menos
  // quebram. Sem isto, editar um lugar e esquecer o outro faz o menu do shell
  // e a barra da app discordarem, sem erro nenhum.
  assert.equal(
    manifesto.nav.length,
    ABAS_TOPO.length,
    'manifesto.json e comum/navegacao.ts têm quantidades diferentes de abas',
  );
  ABAS_TOPO.forEach((aba, i) => {
    assert.deepEqual(
      manifesto.nav[i],
      { titulo: aba.titulo, rota: aba.rota, icone: aba.icone },
      `nav[${i}] divergiu — ${aba.id}`,
    );
  });
});

test('a rota de cada aba deriva do id (a home é a exceção)', () => {
  for (const aba of ABAS_TOPO) {
    const esperada = aba.id === 'regularizacao' ? '/' : `/${aba.id}`;
    assert.equal(aba.rota, esperada, `${aba.id} tem rota ${aba.rota}`);
  }
});

test('o manifesto não traz de volta a aba de `unidades`', () => {
  // Unidade só existe sob incorporação: uma aba global dela só sabe ficar
  // vazia — foi o defeito que a #74 matou.
  //
  // Do lado do TypeScript isto já é ERRO DE COMPILAÇÃO: `ABAS_TOPO` é `as
  // const`, então `a.rota === '/unidades'` nem type-checa. O manifesto é JSON
  // e não tem essa proteção, então é ele que este teste guarda.
  assert.ok(!manifesto.nav.some((n: any) => n.rota === '/unidades'));
});
