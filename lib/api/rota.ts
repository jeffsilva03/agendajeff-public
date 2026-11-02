// Envelope comum das rotas: autentica, aplica o interruptor de integrações e o limite de uso,
// valida parâmetros, converte erros e registra só o mínimo (nunca token nem conteúdo pessoal).
import { autenticar, consumirCota, exigirIntegracaoPermitida, type Identidade } from "./auth";
import { lerParametros } from "./parametros";
import { ErroApi, respostaErro, respostaOk, type Paginacao } from "./respostas";
import type { z } from "zod";

type Resultado = unknown | { data: unknown; pagination: Paginacao };
const comPaginacao = (r: unknown): r is { data: unknown; pagination: Paginacao } =>
  !!r && typeof r === "object" && "pagination" in r && "data" in r;

export interface ContextoRota<P> {
  id: Identidade;
  params: P;
  /** O chamador pediu as notas (include=notes). Liberadas também para clientes externos autorizados. */
  notas: boolean;
}

export function rotaDeLeitura<S extends z.ZodObject>(nome: string, esquema: S, executar: (c: ContextoRota<z.infer<S>>) => Promise<Resultado>) {
  return async function GET(req: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      const id = await autenticar(req);
      exigirIntegracaoPermitida(id);
      const cota = await consumirCota(id);
      const params = lerParametros(new URL(req.url), esquema);
      const pediuNotas = Array.isArray((params as { include?: string[] }).include) && (params as { include: string[] }).include.includes("notes");
      const r = await executar({ id, params, notas: pediuNotas });
      return comPaginacao(r)
        ? respostaOk(r.data, { requestId, pagination: r.pagination, cabecalhos: cota })
        : respostaOk(r, { requestId, cabecalhos: cota });
    } catch (e) {
      if (e instanceof ErroApi) {
        const cabecalhos = e.status === 401
          ? { ...e.cabecalhos, "WWW-Authenticate": `Bearer realm="agendajeff"${e.codigo === "token_invalido" ? ', error="invalid_token"' : ""}` }
          : e.cabecalhos;
        return respostaErro(new ErroApi(e.codigo, e.detalhes, e.message, cabecalhos), requestId);
      }
      // Erro inesperado: registra o nome da rota, o id da requisição e a mensagem técnica, sem dados do usuário.
      console.error(`[api ${nome}] ${requestId}: ${(e as Error)?.message ?? "erro"}`);
      return respostaErro(new ErroApi("erro_interno"), requestId);
    }
  };
}
