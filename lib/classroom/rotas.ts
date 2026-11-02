// Peças comuns das rotas /api/classroom/*: sessão validada no servidor, conta permitida e proteção de origem.
import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import { configClassroom, contaPermitida, type ConfigClassroom } from "./config";

export const SEM_CACHE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export const erroJson = (status: number, erro: string) => Response.json({ erro }, { status, headers: SEM_CACHE });

/** Usuário logado no AgendaJeff (validado no Auth do Supabase), com a configuração da integração. */
export async function exigirUsuario(): Promise<{ ok: true; userId: string; email: string | null; cfg: ConfigClassroom; sb: Awaited<ReturnType<typeof criarClienteServidor>> } | { ok: false; resposta: Response }> {
  const sb = await criarClienteServidor();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return { ok: false, resposta: erroJson(401, "Entre no AgendaJeff para continuar.") };
  const cfg = configClassroom();
  if (!cfg) return { ok: false, resposta: erroJson(503, "Integração com o Classroom não configurada no servidor.") };
  if (!contaPermitida(cfg, data.user.email)) return { ok: false, resposta: erroJson(403, "Esta conta não tem acesso à integração com o Classroom.") };
  return { ok: true, userId: data.user.id, email: data.user.email ?? null, cfg, sb };
}

/** POST só da própria origem (o cookie de sessão é SameSite=Lax, e isto fecha o resto). */
export function mesmaOrigem(req: Request): boolean {
  const origem = req.headers.get("origin");
  if (!origem) return req.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origem).host === new URL(req.url).host; } catch { return false; }
}

/** Endereço de retorno do OAuth (cadastrado no Auth0): a origem pública do app. */
export function urlDeRetorno(req: Request) {
  return process.env.CLASSROOM_REDIRECT_URI?.trim() || `${new URL(req.url).origin}/api/classroom/callback`;
}

/** Cookie do fluxo OAuth (state + verificador PKCE, cifrados). */
export const COOKIE_OAUTH = "classroom_oauth";
