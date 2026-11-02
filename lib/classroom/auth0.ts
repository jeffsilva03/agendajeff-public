// OAuth com o Auth0 do APIClassroom: Authorization Code + PKCE (cliente confidencial, segredo só no servidor),
// renovação por refresh token e revogação. O token é conferido como o APIClassroom confere:
// RS256 pelo JWKS, emissor, audiência, expiração e escopo classroom:read (o "sub" do dono o próprio APIClassroom checa).
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { ConfigClassroom } from "./config";

export const ESCOPO = "classroom:read";
const ESCOPOS_PEDIDOS = `openid offline_access ${ESCOPO}`;

export const novoVerificador = () => randomBytes(32).toString("base64url");
export const desafioPKCE = (verificador: string) => createHash("sha256").update(verificador).digest("base64url");

export function urlDeAutorizacao(cfg: ConfigClassroom, p: { redirectUri: string; state: string; verificador: string }) {
  const q = new URLSearchParams({
    response_type: "code", client_id: cfg.clientId, redirect_uri: p.redirectUri, scope: ESCOPOS_PEDIDOS, audience: cfg.audience,
    state: p.state, code_challenge: desafioPKCE(p.verificador), code_challenge_method: "S256",
  });
  return `${cfg.emissor}authorize?${q}`;
}

export interface Tokens { accessToken: string; refreshToken: string | null; expiraEm: Date; escopo: string; identidade: string }

export class ErroAuth extends Error {
  constructor(public codigo: "negado" | "invalido" | "indisponivel", mensagem: string) { super(mensagem); }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksDe = "";

/** Confere assinatura e claims do access token. Devolve as claims ou lança ErroAuth("invalido"). */
export async function validarAccessToken(cfg: ConfigClassroom, token: string): Promise<JWTPayload> {
  if (!jwks || jwksDe !== cfg.emissor) {
    jwks = createRemoteJWKSet(new URL(`${cfg.emissor}.well-known/jwks.json`), { timeoutDuration: 8000 });
    jwksDe = cfg.emissor;
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: cfg.emissor, audience: cfg.audience, algorithms: ["RS256"], requiredClaims: ["exp", "sub"] });
    const escopos = typeof payload.scope === "string" ? payload.scope.split(" ") : [];
    if (!escopos.includes(ESCOPO)) throw new ErroAuth("negado", "O token não tem o escopo classroom:read.");
    return payload;
  } catch (e) {
    if (e instanceof ErroAuth) throw e;
    throw new ErroAuth("invalido", "Token do Classroom inválido ou expirado.");
  }
}

async function pedirToken(cfg: ConfigClassroom, corpo: Record<string, string>): Promise<Tokens> {
  let r: Response;
  try {
    r = await fetch(`${cfg.emissor}oauth/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...corpo }), signal: AbortSignal.timeout(15000), redirect: "error",
    });
  } catch {
    throw new ErroAuth("indisponivel", "Não foi possível falar com o Auth0.");
  }
  const j = await r.json().catch(() => ({}));
  if (r.status >= 500) throw new ErroAuth("indisponivel", "Auth0 indisponível no momento.");
  // invalid_grant = refresh revogado/expirado ou código já usado: precisa conectar de novo.
  if (!r.ok || typeof j.access_token !== "string") throw new ErroAuth("negado", j.error === "invalid_grant" ? "A autorização expirou ou foi revogada." : "O Auth0 recusou a autorização.");
  const claims = await validarAccessToken(cfg, j.access_token);
  const segundos = typeof j.expires_in === "number" ? j.expires_in : 3600;
  return {
    accessToken: j.access_token, refreshToken: typeof j.refresh_token === "string" ? j.refresh_token : null,
    expiraEm: new Date(Date.now() + segundos * 1000), escopo: typeof j.scope === "string" ? j.scope : String(claims.scope ?? ""), identidade: String(claims.sub),
  };
}

export const trocarCodigo = (cfg: ConfigClassroom, p: { code: string; verificador: string; redirectUri: string }) =>
  pedirToken(cfg, { grant_type: "authorization_code", code: p.code, code_verifier: p.verificador, redirect_uri: p.redirectUri });

export const renovarTokens = (cfg: ConfigClassroom, refreshToken: string) =>
  pedirToken(cfg, { grant_type: "refresh_token", refresh_token: refreshToken });

/** Revoga o refresh token no Auth0 (melhor esforço: a desconexão local acontece de qualquer jeito). */
export async function revogar(cfg: ConfigClassroom, refreshToken: string) {
  try {
    await fetch(`${cfg.emissor}oauth/revoke`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, token: refreshToken }), signal: AbortSignal.timeout(10000), redirect: "error",
    });
  } catch { /* segue com a desconexão local */ }
}
