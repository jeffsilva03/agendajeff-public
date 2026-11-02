// Feed .ics assinável (Calendário do iPhone, Google Agenda, Outlook). Público, protegido pelo token secreto.
import { createClient } from "@supabase/supabase-js";
import { agoraSP } from "@motor";
import { carregarContexto } from "@/lib/dados";
import { gerarIcs } from "@/lib/ics";

export async function GET(_req: Request, { params }: RouteContext<"/calendario/[token]">) {
  const token = (await params).token.replace(/\.ics$/, "");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Não encontrado", { status: 404 });
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) return new Response("Calendário não configurado no servidor", { status: 500 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, { auth: { persistSession: false } });
  const { data: perfil } = await admin.from("profiles").select("user_id").eq("token_calendario", token).maybeSingle();
  if (!perfil) return new Response("Não encontrado", { status: 404 });

  const ctx = await carregarContexto(admin, perfil.user_id);
  const carimbo = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return new Response(gerarIcs(ctx, agoraSP().data, carimbo), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="cadeia.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
