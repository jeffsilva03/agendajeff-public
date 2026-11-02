// Lembrete periódico (ex.: a cada 2 h): só uma frase motivacional. O andamento de tarefas e hábitos
// fica nos lembretes dos horários fixos (8h, 13h, 23h…). Usado pela Edge Function de lembretes
// (service role + userId), pela prévia em Ajustes e pelo exemplo enviado ao aparelho (cliente do usuário, RLS).
import { fraseDoMomento } from "./motor/index.ts";
import type { ClienteSupabase } from "./carregar.ts";

export interface LembretePeriodico { titulo: string; corpo: string; url: string; pendentes?: number }

const SAUDACAO = (hora: string) => (Number(hora.slice(0, 2)) < 12 ? "Bom dia" : Number(hora.slice(0, 2)) < 18 ? "Boa tarde" : "Boa noite");

/** Frase do banco do horário (ou uma das frases próprias do usuário), estável para o mesmo dia e horário. */
export async function montarLembretePeriodico(sb: ClienteSupabase, data: string, hora: string, userId?: string): Promise<LembretePeriodico> {
  let q = sb.from("frases").select("texto").eq("ativa", true);
  if (userId) q = q.eq("user_id", userId);
  const { data: frases, error } = await q;
  if (error) throw new Error(`Falha ao ler frases: ${error.message}`);
  // deno-lint-ignore no-explicit-any
  const proprias = (frases ?? []).map((f: any) => f.texto as string);
  const frase = fraseDoMomento({ hora, pendentes: 0, proprias }, `${data}|${hora}`);
  return { titulo: SAUDACAO(hora), corpo: frase, url: "/hoje" };
}
