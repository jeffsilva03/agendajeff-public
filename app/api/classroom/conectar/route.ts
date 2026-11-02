// Início da conexão com o Classroom: manda para o login do Auth0 (Authorization Code + PKCE).
// O "state" e o verificador PKCE ficam num cookie httpOnly cifrado, de curta duração e só para o retorno.
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { novoVerificador, urlDeAutorizacao } from "@/lib/classroom/auth0";
import { cifrar } from "@/lib/classroom/cripto";
import { COOKIE_OAUTH, exigirUsuario, urlDeRetorno } from "@/lib/classroom/rotas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await exigirUsuario();
  if (!u.ok) return u.resposta;
  const state = randomBytes(24).toString("base64url");
  const verificador = novoVerificador();
  const redirectUri = urlDeRetorno(req);
  const resposta = NextResponse.redirect(urlDeAutorizacao(u.cfg, { redirectUri, state, verificador }));
  resposta.cookies.set(COOKIE_OAUTH, cifrar(JSON.stringify({ state, verificador, userId: u.userId, criado: Date.now() }), u.cfg.chave, "classroom-oauth"), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/classroom/callback", maxAge: 600,
  });
  resposta.headers.set("Cache-Control", "no-store");
  return resposta;
}
