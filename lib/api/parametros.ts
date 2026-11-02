// Validação dos parâmetros de consulta. Estrita: parâmetro desconhecido, data impossível ou intervalo
// grande demais viram 400 (nada de consulta aberta ou "pega tudo").
import { z } from "zod";
import { agoraSP, diasEntre } from "@motor";
import { ErroApi } from "./respostas";

export const LIMITES = { intervaloDias: 62, historicoDias: 92, pagina: 100, offset: 5000, busca: 50, buscaOffset: 500 } as const;

const ehDataReal = (s: string) => {
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const zData = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD").refine(ehDataReal, "data inexistente");
const zBool = z.enum(["true", "false"]).transform((v) => v === "true");
export const zLimit = (max: number = LIMITES.pagina, padrao = 50) => z.coerce.number().int().min(1).max(max).default(Math.min(padrao, max));
export const zOffset = (max: number = LIMITES.offset) => z.coerce.number().int().min(0).max(max).default(0);
/** Lista separada por vírgula, cada item de um conjunto fechado. */
export const zLista = <T extends string>(valores: readonly [T, ...T[]]) =>
  z.string().max(200).transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.enum(valores)).min(1));

export const hojeSP = () => agoraSP().data;

/** Converte a query string em objeto e valida com o esquema (estrito). */
export function lerParametros<S extends z.ZodObject>(url: URL, esquema: S): z.infer<S> {
  const bruto: Record<string, string> = {};
  for (const [k, v] of url.searchParams) {
    if (k in bruto) throw new ErroApi("parametro_invalido", [{ param: k, message: "parâmetro repetido" }]);
    bruto[k] = v;
  }
  const r = esquema.strict().safeParse(bruto);
  if (!r.success) {
    throw new ErroApi("parametro_invalido", r.error.issues.map((i) => ({
      param: i.path.join(".") || (i.code === "unrecognized_keys" ? (i as { keys?: string[] }).keys?.join(",") : ""),
      message: i.code === "unrecognized_keys" ? "parâmetro desconhecido" : i.message,
    })));
  }
  return r.data as z.infer<S>;
}

/** Intervalo fechado [start, end], com teto de dias. */
export function validarIntervalo(start: string, end: string, maxDias: number = LIMITES.intervaloDias) {
  if (end < start) throw new ErroApi("parametro_invalido", [{ param: "end", message: "end antes de start" }]);
  if (diasEntre(start, end) + 1 > maxDias) throw new ErroApi("parametro_invalido", [{ param: "end", message: `intervalo máximo de ${maxDias} dias` }]);
}

export const esquemas = {
  hoje: z.object({ date: zData.optional(), include: zLista(["notes"]).optional() }),
  agenda: z.object({ start: zData, end: zData }),
  tarefas: z.object({
    date: zData.optional(), start: zData.optional(), end: zData.optional(),
    status: z.enum(["pending", "done", "all"]).default("all"),
    overdue: zBool.optional(), important: zBool.optional(), recurring: zBool.optional(),
    include: zLista(["notes"]).optional(), limit: zLimit(), offset: zOffset(),
  }),
  faculdade: z.object({
    date: zData.optional(),
    assessments: z.enum(["pending", "delivered", "all"]).default("pending"),
    type: zLista(["prova", "trabalho", "atividade"]).optional(),
    semester: z.enum(["current", "all"]).default("current"),
    include: zLista(["grades", "notes"]).optional(),
  }),
  habitos: z.object({ date: zData.optional(), start: zData.optional(), end: zData.optional(), habitId: z.uuid().optional() }),
  candidaturas: z.object({
    status: zLista(["enviada", "em_processo", "entrevista", "oferta", "recusada", "desisti"]).optional(),
    upcoming: zBool.optional(), include: zLista(["notes"]).optional(), limit: zLimit(), offset: zOffset(),
  }),
  freelas: z.object({
    status: zLista(["proposta", "em_andamento", "entregue", "pago", "cancelado"]).optional(),
    include: zLista(["notes"]).optional(), limit: zLimit(), offset: zOffset(),
  }),
  semana: z.object({ date: zData.optional() }),
  projetos: z.object({
    status: zLista(["ideia", "planejando", "desenvolvendo", "pausado", "concluido", "arquivado"]).optional(),
    limit: zLimit(), offset: zOffset(),
  }),
  projeto: z.object({}),
  mes: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use AAAA-MM").optional() }),
  insights: z.object({}),
  busca: z.object({
    q: z.string().trim().min(2, "mínimo de 2 caracteres").max(60, "máximo de 60 caracteres"),
    categories: zLista(["tasks", "events", "habits", "college", "applications", "freelances", "projects"]).optional(),
    limit: zLimit(LIMITES.busca, 20), offset: zOffset(LIMITES.buscaOffset),
  }),
} as const;
