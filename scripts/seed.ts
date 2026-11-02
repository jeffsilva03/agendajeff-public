// Uso: npm run seed -- seu@email.com
import { createClient } from "@supabase/supabase-js";
import { aplicarSeed } from "../lib/seed";

const email = process.argv[2];
if (!email) {
  console.error("Informe o e-mail do usuário: npm run seed -- seu@email.com");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.SUPABASE_SECRET_KEY;
if (!url || !chave) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no .env.local");
  process.exit(1);
}

aplicarSeed(createClient(url, chave, { auth: { persistSession: false } }), email)
  .then(({ contagens }) => {
    console.log(`Seed aplicado para ${email}:`);
    for (const [t, n] of Object.entries(contagens)) console.log(`  ${t.padEnd(18)} ${n}`);
  })
  .catch((e) => {
    console.error(`Seed falhou: ${e.message}`);
    process.exit(1);
  });
