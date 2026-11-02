import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Lê .env.local sem depender de pacotes extras.
export const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

export const E2E = { email: "e2e@local.test", senha: "senha-e2e-12345" };
export const admin = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

export async function apagarUsuarioE2E() {
  const sb = admin();
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const u = data?.users.find((x) => x.email === E2E.email);
  if (u) await sb.auth.admin.deleteUser(u.id);
}
