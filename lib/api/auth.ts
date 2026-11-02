// Autenticação da API de integração. A identidade vem só de credenciais validadas pelo Supabase Auth
// (nunca de parâmetro da requisição) e todas as consultas usam um cliente no contexto do usuário,
// então a RLS continua valendo. Nenhuma chave privilegiada (service role / secret) é usada aqui.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ErroApi } from "./respostas";

export interface PerfilApi {
  dias_de_aula: number[] | null;
  inicio_rastreamento: string | null;
  foco_habito_id: string | null;
  foco_semana: string | null;
  integracoes_ativas: boolean;
}

export interface Identidade {
  userId: string;
  /** "sessao": cookie do próprio app; "token": Bearer de uma sessão do usuário; "oauth": token de um cliente externo. */
  origem: "sessao" | "token" | "oauth";
  /** client_id do cliente OAuth (só quando origem = "oauth"). */
  clienteOAuth: string | null;
  sb: SupabaseClient;
  perfil: PerfilApi;
}

const FORMATO_BEARER = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/;

/** Cliente Supabase que age como o dono do token (RLS aplicada pelo Postgres). */
export function clienteDoToken(token: string): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function lerClaims(token: string): Record<string, unknown> {
  const meio = token.split(".")[1];
  return JSON.parse(Buffer.from(meio, "base64url").toString("utf8"));
}

async function carregarPerfil(sb: SupabaseClient): Promise<PerfilApi> {
  const { data, error } = await sb.rpc("api_perfil").maybeSingle();
  if (error) throw new Error(`api_perfil: ${error.code ?? ""}`);
  if (!data) throw new ErroApi("token_invalido");
  return data as PerfilApi;
}

/**
 * Valida um Bearer token no Supabase Auth (assinatura, expiração e sessão ainda ativa: token de
 * sessão encerrada ou de concessão OAuth revogada é recusado) e devolve a identidade.
 */
export async function autenticarToken(token: string): Promise<Identidade> {
  const sb = clienteDoToken(token);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new ErroApi("token_invalido");
  const claims = lerClaims(token);
  const emissor = process.env.SUPABASE_JWT_ISSUER;
  // Audiência: a padrão do Supabase ("authenticated") ou, se o servidor OAuth copiar o parâmetro
  // `resource` para o token, o endereço público do MCP (MCP_RESOURCE_URL).
  const audiencias = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const aceitas = ["authenticated", process.env.MCP_RESOURCE_URL].filter(Boolean);
  if (claims.sub !== data.user.id || claims.role !== "authenticated" || !audiencias.some((a) => aceitas.includes(a as string))
    || claims.is_anonymous === true || (emissor && claims.iss !== emissor)) {
    throw new ErroApi("token_invalido");
  }
  const clienteOAuth = typeof claims.client_id === "string" && claims.client_id ? claims.client_id : null;
  const perfil = await carregarPerfil(sb);
  return { userId: data.user.id, origem: clienteOAuth ? "oauth" : "token", clienteOAuth, sb, perfil };
}

/** Bearer (clientes externos e ferramentas) ou, sem cabeçalho, a sessão do próprio app por cookie. */
export async function autenticar(req: Request): Promise<Identidade> {
  const cabecalho = req.headers.get("authorization");
  if (cabecalho !== null) {
    const m = cabecalho.length <= 8192 ? FORMATO_BEARER.exec(cabecalho.trim()) : null;
    if (!m) throw new ErroApi("token_invalido");
    return autenticarToken(m[1]);
  }
  const sb = await criarClienteServidor();
  const { data, error } = await sb.auth.getUser(); // valida a sessão no Auth, não só o cookie
  if (error || !data.user) throw new ErroApi("nao_autenticado");
  return { userId: data.user.id, origem: "sessao", clienteOAuth: null, sb, perfil: await carregarPerfil(sb) };
}

/** Clientes externos (OAuth) só passam com as integrações ligadas em Ajustes. */
export function exigirIntegracaoPermitida(id: Identidade) {
  if (id.origem === "oauth" && !id.perfil.integracoes_ativas) throw new ErroApi("integracao_desativada");
}


/** Limite de abuso (60 consultas por minuto por usuário e cliente), contado no banco. */
export async function consumirCota(id: Identidade) {
  const { data, error } = await id.sb.rpc("api_registrar_uso");
  if (error) throw new Error(`api_registrar_uso: ${error.code ?? ""}`);
  const r = data as { permitido: boolean; limite: number; restante: number; reinicia_em: string };
  const cabecalhos = { "RateLimit-Limit": String(r.limite), "RateLimit-Remaining": String(r.restante) };
  if (!r.permitido) {
    const segundos = Math.max(1, Math.ceil((new Date(r.reinicia_em).getTime() - Date.now()) / 1000));
    throw new ErroApi("limite_excedido", undefined, undefined, { ...cabecalhos, "Retry-After": String(segundos) });
  }
  return cabecalhos;
}
