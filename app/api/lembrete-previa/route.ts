import { agoraSP } from "@motor";
import { criarClienteServidor } from "@/lib/supabase/server";
import { montarLembretePeriodico } from "../../../supabase/functions/_shared/periodico.ts";

export const dynamic = "force-dynamic";

/** Prévia do lembrete periódico com os dados de agora (só para o próprio usuário, pela sessão do app). */
export async function GET() {
  const sb = await criarClienteServidor();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return Response.json({ erro: "não autenticado" }, { status: 401 });
  const agora = agoraSP();
  try {
    const msg = await montarLembretePeriodico(sb, agora.data, agora.hora);
    return Response.json({ agora, mensagem: msg }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error(`[lembrete-previa] ${(e as Error).message}`);
    return Response.json({ erro: "Não foi possível montar a prévia." }, { status: 500 });
  }
}
