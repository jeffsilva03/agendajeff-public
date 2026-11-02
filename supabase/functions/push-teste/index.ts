// Envia uma notificação de teste para todos os aparelhos do usuário logado.
// Corpo opcional {"tipo": "periodico"}: manda um exemplo do lembrete ao longo do dia (a frase motivacional).
import { createClient } from "npm:@supabase/supabase-js@2";
import { agoraSP } from "../_shared/motor/index.ts";
import { montarLembretePeriodico } from "../_shared/periodico.ts";
import { cors, enviarParaUsuario, json } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user }, error } = await usuario.auth.getUser();
  if (error || !user) return json({ erro: "Sessão inválida. Entre de novo." }, 401);

  const corpo = await req.json().catch(() => ({}));
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const agora = agoraSP();
  try {
    let msg = { titulo: "Notificação de teste", corpo: `Se você está lendo isto, o lembrete chega neste aparelho (${agora.hora}).`, url: "/hoje" } as { titulo: string; corpo: string; url: string; pendentes?: number };
    if (corpo?.tipo === "periodico") {
      msg = await montarLembretePeriodico(admin, agora.data, agora.hora, user.id);
    }
    const resultados = await enviarParaUsuario(admin, msg, { tipo: "teste", userId: user.id, dataLocal: agora.data });
    return json({ resultados, mensagem: msg });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
