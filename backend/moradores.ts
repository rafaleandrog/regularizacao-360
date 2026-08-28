import { Router } from 'express';

/**
 * Cadastro de morador — a ÚNICA escrita que o app faz no Núcleo.
 *
 * Todo o resto do que era escrita virou tabela do próprio `reg360`, porque o
 * monorepo é somente leitura para este trabalho. Aqui não dá: pessoa e vínculo
 * com imóvel são do Núcleo, e duplicá-los no app criaria uma segunda verdade
 * sobre quem mora onde.
 *
 * ## Isto NÃO é atômico, e não dá para ser
 *
 * São quatro chamadas HTTP ao Núcleo (criar PF, telefone, email, vínculo) e
 * **não existe transação entre elas**. Prometer "cria tudo ou nada" seria
 * mentira — e mentira dessa espécie é a pior, porque só aparece no dia em que
 * o terceiro passo falha.
 *
 * O que existe no lugar é melhor para quem usa: a operação é **idempotente e
 * retomável**. Reenviar o mesmo CPF encontra a pessoa que já existe e continua
 * de onde parou; e a resposta diz, passo a passo, o que aconteceu. Nada fica
 * meio-feito em silêncio.
 */

export const rotasMoradores: ReturnType<typeof Router> = Router();

const TIPOS_VINCULO = ['posse_legitima', 'posse_ilegitima', 'usuario'];

function erro(res: any, status: number, codigo: string, mensagem: string, campo?: string) {
  return res.status(status).json({ erro: true, codigo, mensagem, ...(campo ? { campo } : {}) });
}

function podeCadastrar(req: any): boolean {
  const ctx = req.contexto;
  return ctx?.nivelApp === 'admin' || (ctx?.rolesApp || []).includes('criador');
}

/**
 * Dígitos do CPF, **para a busca de duplicata apenas**.
 *
 * Isto não é validar CPF — o app não confere dígito verificador, e não deve: o
 * Núcleo valida na gravação, e reimplementar aqui criaria uma segunda verdade
 * que diverge da dele.
 *
 * Mas a busca por chave precisa do formato **armazenado**, que é só dígitos
 * (`normalizarCPF` do Núcleo faz `replace(/\D/g,'')`). Procurar por
 * `099.775.791-48` não acharia `09977579148`, e o cadastro criaria uma pessoa
 * duplicada — quebrando justamente o que esta rota promete evitar.
 *
 * Na CRIAÇÃO o valor vai como o usuário digitou: quem normaliza e recusa é o
 * Núcleo.
 */
function digitosDoCpf(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

/** Erro do Núcleo que o helper embrulha: preserva status, código e mensagem. */
function statusDe(e: any): number {
  return Number(e?.status) || 500;
}

/**
 * POST /api/reg360/moradores
 *
 * Orquestra os quatro passos. O cliente manda um objeto só — deixar o frontend
 * encadear quatro chamadas espalharia a consistência pelo chamador e deixaria
 * pessoa criada sem vínculo sempre que a última falhasse.
 */
rotasMoradores.post('/moradores', async (req: any, res) => {
  if (!podeCadastrar(req)) {
    return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem cadastrar moradores');
  }
  if (!req.nucleo) {
    return erro(res, 500, 'REG360_NUCLEO_INDISPONIVEL',
      'O helper de Núcleo não está disponível nesta requisição');
  }

  const { nome, cpf, telefone, email, imovel_id: imovelId, tipo_vinculo: tipoVinculo } = req.body ?? {};

  if (!String(nome ?? '').trim()) return erro(res, 400, 'REG360_DADOS_INVALIDOS', 'nome é obrigatório', 'nome');
  if (!String(cpf ?? '').trim()) return erro(res, 400, 'REG360_DADOS_INVALIDOS', 'CPF é obrigatório', 'cpf');

  const querVincular = imovelId !== undefined && imovelId !== null && imovelId !== '';
  if (querVincular) {
    if (!Number.isInteger(Number(imovelId))) {
      return erro(res, 400, 'REG360_DADOS_INVALIDOS', 'imovel_id inválido', 'imovel_id');
    }
    // `tipo_vinculo` é distinção jurídica do Núcleo, não detalhe técnico:
    // posse legítima e ilegítima mudam o caminho da regularização.
    if (!TIPOS_VINCULO.includes(tipoVinculo)) {
      return erro(res, 400, 'REG360_DADOS_INVALIDOS',
        `tipo_vinculo deve ser ${TIPOS_VINCULO.join(', ')}`, 'tipo_vinculo');
    }
  }

  const passos: Record<string, string> = {};

  try {
    // 1. A pessoa já existe? `buscarPorChave` é a ÚNICA leitura que o backend
    //    tem do Núcleo, e existe exatamente para detectar duplicata.
    const chaveCpf = digitosDoCpf(cpf);
    let pessoaId: number | null = null;
    let reaproveitada = false;

    if (chaveCpf) {
      const { achados } = await req.nucleo.buscarPorChave('pessoas_fisicas', ['cpf'], [{ cpf: chaveCpf }], ['nome']);
      const achada = achados.get(chaveCpf);
      if (achada) {
        pessoaId = Number(achada.id);
        reaproveitada = true;
        passos.pessoa = `já existia (id ${pessoaId}, ${achada.nome ?? 'sem nome'})`;
      }
    }

    // 2. Criar, se não existia. O CPF vai CRU: quem valida dígito e normaliza
    //    é o Núcleo, e o erro dele chega ao usuário no campo certo.
    if (pessoaId === null) {
      const r = await req.nucleo.batch('pessoas_fisicas', [{ nome: String(nome).trim(), cpf }]);
      const item = r?.resultados?.[0];
      if (!item?.ok) {
        const cod = item?.erro?.codigo ?? 'REG360_CRIAR_FALHOU';
        const msg = item?.erro?.mensagem ?? 'Falha ao criar a pessoa no Núcleo';
        // CPF inválido ou duplicado é erro DO CAMPO, e a tela precisa saber
        // qual campo apontar. Mensagem genérica manda o usuário adivinhar.
        return erro(res, 400, cod, msg, /cpf/i.test(msg) ? 'cpf' : undefined);
      }
      pessoaId = Number(item.dado?.id);
      passos.pessoa = `criada (id ${pessoaId})`;
    }

    // 3. Telefone e email. `409 CONFLITO_UNIQUE` não é falha: é o contato que
    //    já estava lá, que é o caso normal ao reenviar.
    for (const [campo, valor, sub] of [
      ['telefone', telefone, 'telefones'],
      ['email', email, 'emails'],
    ] as const) {
      if (!String(valor ?? '').trim()) continue;
      try {
        await req.nucleo.chamarSubrecurso(`/pessoas/fisicas/${pessoaId}/${sub}`, { [campo]: valor });
        passos[campo] = 'adicionado';
      } catch (e: any) {
        if (statusDe(e) === 409) { passos[campo] = 'já existia'; continue; }
        // Formato recusado pelo Núcleo: a pessoa JÁ FOI criada, então devolver
        // erro seco perderia esse fato. O passo registra, e o 207 abaixo diz
        // que a operação foi parcial.
        passos[campo] = `recusado pelo Núcleo: ${e?.mensagem ?? e?.message ?? 'erro'}`;
      }
    }

    // 4. Vínculo com o imóvel.
    if (querVincular) {
      try {
        await req.nucleo.chamarSubrecurso(`/lotes/${Number(imovelId)}/pessoas`, {
          // `pessoa_id` precisa ser NUMBER: o Núcleo checa `typeof`, e string
          // tomaria 400 com mensagem que não diz isso.
          pessoa_id: Number(pessoaId),
          tipo_vinculo: tipoVinculo,
        });
        passos.vinculo = 'criado';
      } catch (e: any) {
        if (statusDe(e) === 409) passos.vinculo = 'já existia';
        else passos.vinculo = `falhou: ${e?.mensagem ?? e?.message ?? 'erro'}`;
      }
    }

    const parcial = Object.values(passos).some((p) => p.startsWith('recusado') || p.startsWith('falhou'));
    // 207 quando algo ficou pelo caminho: a pessoa existe, e fingir 201 faria a
    // tela dizer "cadastrado" sobre um cadastro incompleto.
    res.status(parcial ? 207 : 201).json({
      pessoa_id: pessoaId,
      reaproveitada,
      parcial,
      passos,
      // Reenviar o mesmo corpo retoma de onde parou — não duplica.
      ...(parcial ? { mensagem: 'Cadastro parcial. Reenviar o mesmo formulário retoma de onde parou.' } : {}),
    });
  } catch (e: any) {
    // Falha de flag do Núcleo chega aqui com status e código próprios, e a tela
    // precisa deles para mostrar o banner explicável em vez de erro genérico.
    const status = statusDe(e);
    return res.status(status).json({
      erro: true,
      codigo: e?.codigo ?? 'REG360_CADASTRO_FALHOU',
      mensagem: e?.mensagem ?? e?.message ?? 'Falha ao cadastrar o morador',
      entidade: e?.entidade,
      flag: e?.flag,
      passos,
    });
  }
});

// POST /api/reg360/moradores/:pessoaId/desvincular/:loteId/:vinculoId
//
// Desvincular tem rota própria e não faz parte do cadastro: é a operação
// inversa, e juntá-las faria um formulário de criação carregar poder de apagar.
rotasMoradores.post('/moradores/desvincular/:loteId/:vinculoId', async (req: any, res) => {
  if (!podeCadastrar(req)) {
    return erro(res, 403, 'SEM_PERMISSAO', 'Apenas criadores podem desvincular moradores');
  }
  if (!req.nucleo) {
    return erro(res, 500, 'REG360_NUCLEO_INDISPONIVEL', 'O helper de Núcleo não está disponível');
  }
  const loteId = Number(req.params.loteId);
  const vinculoId = Number(req.params.vinculoId);
  if (!Number.isInteger(loteId) || !Number.isInteger(vinculoId)) {
    return erro(res, 400, 'REG360_PARAMS_INVALIDOS', 'loteId e vinculoId devem ser inteiros');
  }
  try {
    await req.nucleo.chamarSubrecurso(`/lotes/${loteId}/pessoas/${vinculoId}/remover`, {});
    res.json({ removido: true, lote_id: loteId, vinculo_id: vinculoId });
  } catch (e: any) {
    res.status(statusDe(e)).json({
      erro: true,
      codigo: e?.codigo ?? 'REG360_DESVINCULAR_FALHOU',
      mensagem: e?.mensagem ?? e?.message ?? 'Falha ao desvincular',
    });
  }
});
