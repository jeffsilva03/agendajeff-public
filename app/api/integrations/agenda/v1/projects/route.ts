import { esquemas } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { listarProjetos } from "@/lib/api/servicos/projetos";

export const dynamic = "force-dynamic";

/** Projetos com status, prioridade, tecnologias, próximo passo, prazo e progresso das features (geral e do MVP). */
export const GET = rotaDeLeitura("projects", esquemas.projetos, ({ id, params }) => listarProjetos(id, params));
