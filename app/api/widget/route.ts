// Dados dos widgets. Duas formas de entrar:
// - Bearer wjt_… (token do widget, gerado em Ajustes; só o hash fica no banco) — usado pelo Scriptable no iPhone;
// - cookie de sessão do app — usado pelo service worker do PWA no Windows (mesma origem).
// Só leitura e só o resumo do dia; nenhum outro dado sai por aqui.
import { createClient } from "@supabase/supabase-js";
import { agoraSP } from "@motor";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hashToken, montarResumoWidget, paraAdaptiveCard } from "@/lib/widget";

export const dynamic = "force-dynamic";

const CABECALHOS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const negar = () => Response.json({ erro: "não autorizado" }, { status: 401, headers: CABECALHOS });

export async function GET(req: Request) {
  const agora = agoraSP();
  const formato = new URL(req.url).searchParams.get("formato");
  const cabecalho = req.headers.get("authorization");
  try {
    let resumo;
    if (cabecalho) {
      const m = /^Bearer (wjt_[A-Za-z0-9_-]{40,100})$/.exec(cabecalho.trim());
      if (!m) return negar();
      const chave = process.env.SUPABASE_SECRET_KEY;
      if (!chave) return Response.json({ erro: "widget não configurado no servidor" }, { status: 500, headers: CABECALHOS });
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, { auth: { persistSession: false } });
      const { data: perfil } = await admin.from("profiles").select("user_id").eq("widget_token_hash", await hashToken(m[1])).maybeSingle();
      if (!perfil) return negar();
      resumo = await montarResumoWidget(admin, agora.data, agora.hora, perfil.user_id);
    } else {
      const sb = await criarClienteServidor();
      const { data, error } = await sb.auth.getUser();
      if (error || !data.user) return negar();
      resumo = await montarResumoWidget(sb, agora.data, agora.hora);
    }
    const corpo = formato === "adaptive" ? paraAdaptiveCard(resumo, `${new URL(req.url).origin}/hoje`) : resumo;
    return Response.json(corpo, { headers: CABECALHOS });
  } catch (e) {
    console.error(`[widget] ${(e as Error).message}`);
    return Response.json({ erro: "Não foi possível montar o resumo." }, { status: 500, headers: CABECALHOS });
  }
}
