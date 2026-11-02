// Desconectar: revoga o refresh token no Auth0 e apaga os tokens. As atividades já sincronizadas ficam
// (somem da agenda só se a turma deixar de ser acompanhada); com {"apagarDados": true}, apaga também.
import { revogar } from "@/lib/classroom/auth0";
import { decifrar } from "@/lib/classroom/cripto";
import { erroJson, exigirUsuario, mesmaOrigem, SEM_CACHE } from "@/lib/classroom/rotas";
import { clienteAdmin } from "@/lib/classroom/tokens";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return erroJson(403, "Origem não permitida.");
  const u = await exigirUsuario();
  if (!u.ok) return u.resposta;
  const corpo = await req.json().catch(() => ({}));
  const admin = clienteAdmin();
  const { data } = await admin.from("classroom_tokens").select("refresh_token").eq("user_id", u.userId).maybeSingle();
  if (data?.refresh_token) {
    try { await revogar(u.cfg, decifrar(data.refresh_token, u.cfg.chave, `classroom:${u.userId}:refresh`)); } catch { /* segue */ }
  }
  await admin.from("classroom_tokens").delete().eq("user_id", u.userId);
  await admin.from("classroom_conexoes").update({ estado: "desconectado", identidade: null, sync_iniciada_em: null, atualizado_em: new Date().toISOString() }).eq("user_id", u.userId);
  if (corpo?.apagarDados === true) {
    await admin.from("classroom_atividades").delete().eq("user_id", u.userId);
    await admin.from("classroom_turmas").delete().eq("user_id", u.userId);
    await admin.from("classroom_sincronizacoes").delete().eq("user_id", u.userId);
  }
  return Response.json({ ok: true }, { headers: SEM_CACHE });
}
