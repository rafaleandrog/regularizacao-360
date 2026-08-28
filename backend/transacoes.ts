import { Router } from 'express';
import { DISPONIVEL, INDISPONIVEL } from '../comum/transacoes-contrato.js';

/**
 * Adaptador de Transação no backend.
 *
 * **Uma costura só.** Enquanto `DISPONIVEL` for falso, todas as rotas respondem
 * `501` com código semântico e mensagem que diz **o que falta** — nunca erro
 * genérico, que faria o usuário procurar problema de permissão ou de rede.
 *
 * Quando a entidade existir no Núcleo, é este arquivo que passa a chamar
 * `req.nucleo`: nenhuma tela muda, porque nenhuma tela conhece o formato.
 *
 * As rotas existem hoje, mesmo indisponíveis, de propósito: rota ausente devolve
 * `404`, que é indistinguível de erro de digitação no caminho.
 */

export const rotasTransacoes: ReturnType<typeof Router> = Router();

function indisponivel(res: any) {
  return res.status(501).json({ erro: true, ...INDISPONIVEL });
}

/**
 * Toda rota de transação passa por aqui. Quando `DISPONIVEL` virar `true`, o
 * corpo de cada handler é escrito — e este guard sai de uma vez só.
 */
function comAdaptador(handler: (req: any, res: any) => unknown) {
  // `next` é obrigatório aqui: no Express 4 uma promessa rejeitada devolvida
  // pelo handler NÃO chega ao middleware de erro. Quando o adaptador ligar e
  // uma chamada ao Núcleo falhar, a requisição ficaria sem resposta e a
  // rejeição sem tratamento — o pior desfecho possível, porque não erra nem
  // responde.
  return (req: any, res: any, next: any) => {
    if (!DISPONIVEL) return indisponivel(res);
    try {
      return Promise.resolve(handler(req, res)).catch(next);
    } catch (err) {
      return next(err);
    }
  };
}

// GET /api/reg360/transacoes — listar (filtros: imovel_id, imovel_tipo, tipo)
rotasTransacoes.get('/transacoes', comAdaptador(() => {
  throw new Error('Adaptador de Transação ligado sem implementação de leitura');
}));

// POST /api/reg360/transacoes — criar
rotasTransacoes.post('/transacoes', comAdaptador(() => {
  throw new Error('Adaptador de Transação ligado sem implementação de escrita');
}));

// POST /api/reg360/transacoes/:id/aprovar
rotasTransacoes.post('/transacoes/:id/aprovar', comAdaptador(() => {
  throw new Error('Adaptador de Transação ligado sem implementação de aprovação');
}));

/**
 * Estado do adaptador, para a tela decidir o que mostrar sem repetir a regra.
 *
 * Rota pública do app (não do Núcleo): a UI pergunta em vez de carregar uma
 * constante compilada, para que ligar a Transação no servidor não exija
 * republicar o frontend.
 */
rotasTransacoes.get('/transacoes-estado', (_req, res) => {
  res.json(DISPONIVEL ? { disponivel: true } : INDISPONIVEL);
});
