// Contrato das respostas da API de integração: envelope único, erros com código estável,
// sem detalhes internos e nunca em cache compartilhado (são dados pessoais).
import { FUSO } from "@motor";

export type CodigoErro =
  | "nao_autenticado" // sem credencial
  | "token_invalido" // credencial inválida, expirada ou revogada
  | "integracao_desativada" // cliente externo, mas o usuário desligou as integrações em Ajustes
  | "escopo_insuficiente" // pediu algo que este tipo de acesso não pode ver (ex.: notas)
  | "parametro_invalido"
  | "nao_encontrado"
  | "limite_excedido"
  | "erro_interno";

const STATUS: Record<CodigoErro, number> = {
  nao_autenticado: 401, token_invalido: 401, integracao_desativada: 403, escopo_insuficiente: 403,
  parametro_invalido: 400, nao_encontrado: 404, limite_excedido: 429, erro_interno: 500,
};

const MENSAGEM: Record<CodigoErro, string> = {
  nao_autenticado: "Autenticação necessária.",
  token_invalido: "Credencial inválida, expirada ou revogada.",
  integracao_desativada: "As integrações externas estão desligadas. Ative em Ajustes → Integrações externas.",
  escopo_insuficiente: "Este acesso não permite consultar essa informação.",
  parametro_invalido: "Parâmetros inválidos.",
  nao_encontrado: "Recurso não encontrado.",
  limite_excedido: "Muitas consultas em pouco tempo. Tente de novo em instantes.",
  erro_interno: "Não foi possível concluir a consulta.",
};

/** Erro de domínio que vira resposta HTTP com código estável. */
export class ErroApi extends Error {
  constructor(public codigo: CodigoErro, public detalhes?: unknown, mensagem?: string, public cabecalhos?: Record<string, string>) {
    super(mensagem ?? MENSAGEM[codigo]);
  }
  get status() { return STATUS[this.codigo]; }
}

/** "2026-10-12T15:00:00-03:00": instante no fuso de São Paulo com o deslocamento explícito. */
export function isoSP(instante: Date = new Date()): string {
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset",
  }).formatToParts(instante).map((p) => [p.type, p.value]));
  const desloc = (partes.timeZoneName as string).replace("GMT", "") || "+00:00";
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}${desloc}`;
}

/** Data local + "HH:MM" → ISO 8601 com o deslocamento de São Paulo naquela data. */
export function dataHoraSP(data: string, hora: string | null): string | null {
  if (!hora) return null;
  const meioDia = isoSP(new Date(`${data}T15:00:00Z`)); // o deslocamento do dia (sem horário de verão desde 2019)
  return `${data}T${hora}:00${meioDia.slice(19)}`;
}

const CABECALHOS_BASE = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
  "Vary": "Authorization, Cookie",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export interface Paginacao { limit: number; offset: number; total: number; hasMore: boolean }

export function respostaOk(data: unknown, extra: { requestId: string; pagination?: Paginacao; cabecalhos?: Record<string, string> }) {
  return new Response(JSON.stringify({
    success: true,
    data,
    meta: {
      timezone: FUSO,
      generatedAt: isoSP(),
      source: "AgendaJeff",
      apiVersion: "v1",
      requestId: extra.requestId,
      ...(extra.pagination ? { pagination: extra.pagination } : {}),
    },
  }), { status: 200, headers: { ...CABECALHOS_BASE, "X-Request-Id": extra.requestId, ...extra.cabecalhos } });
}

export function respostaErro(erro: ErroApi, requestId: string) {
  return new Response(JSON.stringify({
    success: false,
    error: { code: erro.codigo, message: erro.message, ...(erro.detalhes ? { details: erro.detalhes } : {}) },
    meta: { requestId, apiVersion: "v1" },
  }), { status: erro.status, headers: { ...CABECALHOS_BASE, "X-Request-Id": requestId, ...erro.cabecalhos } });
}

export function paginar<T>(lista: T[], limit: number, offset: number): { itens: T[]; pagination: Paginacao } {
  return { itens: lista.slice(offset, offset + limit), pagination: { limit, offset, total: lista.length, hasMore: offset + limit < lista.length } };
}
