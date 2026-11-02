// "Sincronizar agora": roda no servidor com a sessão do usuário validada; devolve o resumo real da execução.
import { erroJson, exigirUsuario, mesmaOrigem, SEM_CACHE } from "@/lib/classroom/rotas";
import { sincronizarClassroom } from "@/lib/classroom/sincronizar";
import { clienteAdmin } from "@/lib/classroom/tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return erroJson(403, "Origem não permitida.");
  const u = await exigirUsuario();
  if (!u.ok) return u.resposta;
  try {
    const resumo = await sincronizarClassroom(clienteAdmin(), u.cfg, u.userId, "manual");
    return Response.json({ resumo }, { headers: SEM_CACHE });
  } catch (e) {
    console.error(`[classroom sincronizar] ${(e as Error)?.message ?? "erro"}`);
    return erroJson(500, "Não foi possível sincronizar agora.");
  }
}
