// Detalhe de uma atividade (descrição completa e anexos), buscado só quando o usuário abre o cartão.
import { ErroAuth } from "@/lib/classroom/auth0";
import { ClienteClassroom, ErroClassroom } from "@/lib/classroom/cliente";
import { linkSeguro } from "@/lib/classroom/normalizar";
import { erroJson, exigirUsuario, SEM_CACHE } from "@/lib/classroom/rotas";
import { clienteAdmin, fornecedorDeToken } from "@/lib/classroom/tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const u = await exigirUsuario();
  if (!u.ok) return u.resposta;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return erroJson(400, "Atividade inválida.");
  // A linha é lida com a sessão do usuário (RLS): só a dele.
  const { data: linha } = await u.sb.from("classroom_atividades").select("course_id, activity_id").eq("id", id).maybeSingle();
  if (!linha) return erroJson(404, "Atividade não encontrada.");
  try {
    const admin = clienteAdmin();
    const a = await new ClienteClassroom(u.cfg, { token: fornecedorDeToken(admin, u.cfg, u.userId) }).detalhe(linha.course_id, linha.activity_id);
    return Response.json({
      descricao: typeof a.descricao === "string" ? a.descricao.slice(0, 20000) : null,
      anexos: (Array.isArray(a.anexos) ? a.anexos : []).slice(0, 30).map((x) => ({ tipo: String(x?.tipo ?? "outro").slice(0, 40), nome: typeof x?.nome === "string" ? x.nome.slice(0, 300) : null, link: linkSeguro(x?.link) })),
    }, { headers: SEM_CACHE });
  } catch (e) {
    if (e instanceof ErroAuth || (e instanceof ErroClassroom && e.reautorizar)) return erroJson(401, "Reconecte o Classroom para ver o detalhe.");
    if (e instanceof ErroClassroom) return erroJson(e.status === 404 ? 404 : 502, e.status === 404 ? "A atividade não está mais disponível no Classroom." : "O Classroom não respondeu agora. Tente de novo.");
    return erroJson(500, "Não foi possível carregar o detalhe.");
  }
}
