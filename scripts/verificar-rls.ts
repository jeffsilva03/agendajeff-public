// Verifica a RLS: um segundo usuário não enxerga nem altera nada do primeiro.
// Uso: npm run verificar:rls -- email-do-dono senha-do-dono
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const tabelas = ["profiles", "habits", "chains", "chain_steps", "checks", "daily_flex_rules", "events", "feriados",
  "freelas", "freela_time_logs", "reminder_slots", "push_subscriptions", "notification_log", "pendencias",
  "tarefas", "semestres", "disciplinas", "aulas", "avaliacoes", "tarefas_recorrentes", "candidaturas", "focos"];

async function cliente(email: string, senha: string) {
  const c = createClient(url, pub, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}

async function main() {
  const [emailDono, senhaDono] = process.argv.slice(2);
  const dono = await cliente(emailDono, senhaDono);
  const intruso = { email: `intruso-${Date.now()}@local.test`, password: "senha-intruso-123" };
  const { data: criado, error } = await admin.auth.admin.createUser({ ...intruso, email_confirm: true });
  if (error) throw error;
  let falhas = 0;
  try {
    const outro = await cliente(intruso.email, intruso.password);
    for (const t of tabelas) {
      const { count: doDono } = await dono.from(t).select("*", { count: "exact", head: true });
      const { count: visto } = await outro.from(t).select("*", { count: "exact", head: true });
      const proprio = t === "profiles" ? 1 : 0; // o intruso vê só o próprio perfil
      const okLinha = visto === proprio;
      if (!okLinha) falhas++;
      console.log(`${okLinha ? "ok   " : "FALHA"} ${t.padEnd(18)} dono vê ${doDono}, intruso vê ${visto}`);
    }
    const { data: h } = await dono.from("habits").select("id").limit(1).single();
    const { data: alterado } = await outro.from("habits").update({ nome: "invadido" }).eq("id", h!.id).select();
    const { error: erroCheck } = await outro.from("checks").insert({ habit_id: h!.id, data_local: "2026-10-13", status: "completo" });
    const bloqueouUpdate = (alterado ?? []).length === 0, bloqueouInsert = !!erroCheck;
    if (!bloqueouUpdate || !bloqueouInsert) falhas++;
    console.log(`${bloqueouUpdate ? "ok   " : "FALHA"} intruso não altera hábito do dono`);
    console.log(`${bloqueouInsert ? "ok   " : "FALHA"} intruso não registra check em hábito do dono (${erroCheck?.message ?? "inseriu!"})`);
  } finally {
    await admin.auth.admin.deleteUser(criado.user.id);
  }
  if (falhas) { console.error(`${falhas} falha(s) de RLS`); process.exit(1); }
  console.log("RLS verificada.");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
