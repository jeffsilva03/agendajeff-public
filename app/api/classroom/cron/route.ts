// Sincronização automática: chamada pelo pg_cron do Supabase (a cada 3 h), protegida pelo segredo do cron.
// Só roda para conexões ativas com a sincronização automática ligada; a trava por usuário evita sobreposição.
import { timingSafeEqual } from "node:crypto";
import { configClassroom } from "@/lib/classroom/config";
import { erroJson, SEM_CACHE } from "@/lib/classroom/rotas";
import { sincronizarClassroom, type ResumoSync } from "@/lib/classroom/sincronizar";
import { clienteAdmin } from "@/lib/classroom/tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const segredoConfere = (recebido: string | null) => {
  const esperado = process.env.CRON_SECRET;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function POST(req: Request) {
  if (!segredoConfere(req.headers.get("x-cron-secret"))) return erroJson(401, "não autorizado");
  const cfg = configClassroom();
  if (!cfg) return erroJson(503, "integração não configurada");
  const admin = clienteAdmin();
  // Fora de produção, os testes restringem a um usuário (para não sincronizar contas reais do banco local com o simulador).
  const corpo = process.env.NODE_ENV !== "production" ? await req.json().catch(() => ({})) : {};
  let consulta = admin.from("classroom_conexoes").select("user_id").eq("estado", "conectado").eq("auto_sync", true);
  if (typeof corpo?.usuario === "string" && /^[0-9a-f-]{36}$/i.test(corpo.usuario)) consulta = consulta.eq("user_id", corpo.usuario);
  const { data, error } = await consulta;
  if (error) return erroJson(500, "falha ao ler conexões");
  const resultados: { resultado: ResumoSync["resultado"]; motivo?: string }[] = [];
  for (const c of data ?? []) {
    try {
      const r = await sincronizarClassroom(admin, cfg, c.user_id, "automatica");
      resultados.push({ resultado: r.resultado, motivo: r.motivo });
    } catch (e) {
      console.error(`[classroom cron] ${(e as Error)?.message ?? "erro"}`);
      resultados.push({ resultado: "erro" });
    }
  }
  return Response.json({ processadas: resultados.length, resultados }, { headers: SEM_CACHE });
}
