// Web Push no navegador: detecção de suporte/instalação e inscrição do aparelho.
import type { SupabaseClient } from "@supabase/supabase-js";
import { URL_SW } from "@/lib/sw";

export const ehIOS = () =>
  typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const estaInstalado = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const suportaPush = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function rotuloPadrao(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return /Edg\//.test(ua) ? "PC Windows (Edge)" : "PC Windows (Chrome)";
  if (/Mac/.test(ua)) return "Mac";
  return "Este aparelho";
}

function chaveParaBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

export async function inscricaoAtual(): Promise<PushSubscription | null> {
  if (!suportaPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Precisa ser chamada a partir de um toque do usuário (exigência do iOS). */
export async function ativarPush(sb: SupabaseClient, rotulo: string) {
  if (!suportaPush()) throw new Error("Este navegador não suporta notificações push.");
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") throw new Error(permissao === "denied"
    ? "As notificações foram bloqueadas. Libere nas configurações do navegador/aparelho e tente de novo."
    : "Permissão não concedida.");
  const reg = await navigator.serviceWorker.register(URL_SW);
  await navigator.serviceWorker.ready;
  const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!chave) throw new Error("Chave pública VAPID não configurada.");
  let sub: PushSubscription;
  try {
    sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) });
  } catch (e) {
    throw new Error(`O navegador não conseguiu se inscrever no serviço de notificações (${(e as Error).message}). Confira se o app está instalado e se as notificações estão liberadas.`);
  }
  const j = sub.toJSON();
  const { error } = await sb.from("push_subscriptions").upsert(
    { endpoint: sub.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth, rotulo: rotulo.trim() || rotuloPadrao(), user_agent: navigator.userAgent },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(`Não foi possível salvar o aparelho: ${error.message}`);
}

export async function desativarPushNesteAparelho(sb: SupabaseClient) {
  const sub = await inscricaoAtual();
  if (!sub) return;
  await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
