import { esquemas } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { buscar, CATEGORIAS } from "@/lib/api/servicos/busca";

export const dynamic = "force-dynamic";

/** Busca por título/nome em tarefas, eventos, hábitos, faculdade, candidaturas e freelas. */
export const GET = rotaDeLeitura("search", esquemas.busca, ({ id, params }) => buscar(id, params.q, params.categories ?? CATEGORIAS, params.limit, params.offset));
