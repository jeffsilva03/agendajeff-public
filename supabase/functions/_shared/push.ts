// Envio de Web Push (VAPID) e registro em notification_log.
import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

export interface Mensagem {
  titulo: string;
  corpo: string;
  url: string;
  pendentes?: number;
}

export interface Envio {
  tipo: "agendado" | "teste" | "periodico";
  userId: string;
  dataLocal: string;
  slotHora?: string | null;
}

/** Envia para todos os aparelhos do usuário. Remove inscrições expiradas (404/410). */
export async function enviarParaUsuario(admin: SupabaseClient, msg: Mensagem, envio: Envio) {
  const { data: subs, error } = await admin.from("push_subscriptions").select("*").eq("user_id", envio.userId);
  if (error) throw new Error(`Falha ao ler aparelhos: ${error.message}`);
  const base = { user_id: envio.userId, tipo: envio.tipo, slot_hora: envio.slotHora ?? null, data_local: envio.dataLocal, titulo: msg.titulo, corpo: msg.corpo };
  if (!subs?.length) {
    await admin.from("notification_log").insert({ ...base, status: "sem_aparelho", erro: "Nenhum aparelho com notificações ativadas" });
    return [];
  }
  const payload = JSON.stringify({ title: msg.titulo, body: msg.corpo, url: msg.url, pendentes: msg.pendentes ?? null });
  const resultados = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60, urgency: "high" });
      await admin.from("push_subscriptions").update({ ultimo_uso: new Date().toISOString() }).eq("id", s.id);
      await admin.from("notification_log").insert({ ...base, subscription_id: s.id, status: "enviado" });
      resultados.push({ aparelho: s.rotulo, ok: true });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      const texto = `${status ?? ""} ${(e as Error).message}`.trim();
      await admin.from("notification_log").insert({ ...base, subscription_id: s.id, status: "erro", erro: texto });
      if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      resultados.push({ aparelho: s.rotulo, ok: false, erro: texto });
    }
  }
  return resultados;
}

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
