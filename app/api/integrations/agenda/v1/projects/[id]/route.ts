import { esquemas } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { ErroApi } from "@/lib/api/respostas";
import { detalheProjeto } from "@/lib/api/servicos/projetos";

export const dynamic = "force-dynamic";

/** Um projeto completo: descrição, problema, público, anotações, links e todas as features. */
export const GET = (req: Request) => {
  const projetoId = new URL(req.url).pathname.split("/").pop() ?? "";
  return rotaDeLeitura("project", esquemas.projeto, ({ id }) => {
    if (!/^[0-9a-f-]{36}$/i.test(projetoId)) throw new ErroApi("parametro_invalido", [{ param: "id", message: "id de projeto inválido" }]);
    return detalheProjeto(id, projetoId);
  })(req);
};
