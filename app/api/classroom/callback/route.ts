// Retorno do Auth0: confere o state, troca o código (com o verificador PKCE e o segredo do cliente),
// valida o token como o APIClassroom valida e testa uma chamada real antes de dar a conexão por feita.
import { NextResponse } from "next/server";
import { ErroAuth, trocarCodigo } from "@/lib/classroom/auth0";
import { ClienteClassroom, ErroClassroom } from "@/lib/classroom/cliente";
import { decifrar } from "@/lib/classroom/cripto";
import { COOKIE_OAUTH, exigirUsuario, urlDeRetorno } from "@/lib/classroom/rotas";
import { clienteAdmin, salvarTokens } from "@/lib/classroom/tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const voltar = (q: string) => {
    const r = NextResponse.redirect(new URL(`/faculdade?aba=classroom&${q}`, url.origin));
    r.cookies.delete({ name: COOKIE_OAUTH, path: "/api/classroom/callback" });
    r.headers.set("Cache-Control", "no-store");
    return r;
  };
  const u = await exigirUsuario();
  if (!u.ok) return u.resposta;

  const cookie = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE_OAUTH}=`))?.slice(COOKIE_OAUTH.length + 1);
  let guardado: { state: string; verificador: string; userId: string; criado: number } | null = null;
  try { guardado = cookie ? JSON.parse(decifrar(decodeURIComponent(cookie), u.cfg.chave, "classroom-oauth")) : null; } catch { guardado = null; }
  const state = url.searchParams.get("state");
  if (!guardado || !state || guardado.state !== state || guardado.userId !== u.userId || Date.now() - guardado.criado > 600_000)
    return voltar("erro=estado_invalido");
  if (url.searchParams.get("error")) return voltar(`erro=${url.searchParams.get("error") === "access_denied" ? "negado" : "auth0"}`);
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) return voltar("erro=codigo_ausente");

  const admin = clienteAdmin();
  try {
    const tokens = await trocarCodigo(u.cfg, { code, verificador: guardado.verificador, redirectUri: urlDeRetorno(req) });
    // Chamada real: o APIClassroom só responde 200 para a identidade dona (sub) com o escopo certo.
    const turmas = await new ClienteClassroom(u.cfg, { token: async () => tokens.accessToken }).turmas();
    await salvarTokens(admin, u.cfg, u.userId, tokens);
    const agora = new Date().toISOString();
    const { error } = await admin.from("classroom_conexoes").upsert({ user_id: u.userId, estado: "conectado", identidade: tokens.identidade, conectado_em: agora, atualizado_em: agora, sync_iniciada_em: null });
    if (error) throw new Error(error.message);
    if (turmas.length) {
      await admin.from("classroom_turmas").upsert(turmas.filter((t) => /^[A-Za-z0-9_-]{1,180}$/.test(t.id)).map((t) => ({
        user_id: u.userId, course_id: t.id, nome: String(t.nome ?? t.id).slice(0, 300), estado: t.status ?? null,
        aliases: Array.isArray(t.aliases) ? t.aliases.slice(0, 20).map(String) : [], link: typeof t.link === "string" && t.link.startsWith("https://") ? t.link : null,
        atualizado_origem: t.atualizado_em ?? null, visto_em: agora,
      })), { onConflict: "user_id,course_id" });
    }
    return voltar("conectado=1");
  } catch (e) {
    if (e instanceof ErroClassroom) return voltar(`erro=${e.status === 403 ? "identidade" : e.temporario ? "indisponivel" : "api"}`);
    if (e instanceof ErroAuth) return voltar(`erro=${e.codigo === "indisponivel" ? "indisponivel" : "auth0"}`);
    console.error(`[classroom callback] ${(e as Error)?.message ?? "erro"}`);
    return voltar("erro=interno");
  }
}
