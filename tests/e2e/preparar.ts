import { aplicarSeed } from "../../lib/seed";
import { admin, apagarUsuarioE2E, E2E } from "./ambiente";

export default async function preparar() {
  await apagarUsuarioE2E();
  const sb = admin();
  const { error } = await sb.auth.admin.createUser({ email: E2E.email, password: E2E.senha, email_confirm: true });
  if (error) throw new Error(`Não criou o usuário de teste: ${error.message}`);
  await aplicarSeed(sb, E2E.email, "tests/fixtures/dados-exemplo.json");
}
