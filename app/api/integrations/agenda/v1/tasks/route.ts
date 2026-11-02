import { esquemas } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { listarTarefas } from "@/lib/api/servicos/tarefas";

export const dynamic = "force-dynamic";

/** Tarefas de um dia, de um intervalo ou só as atrasadas, com filtros e paginação. */
export const GET = rotaDeLeitura("tasks", esquemas.tarefas, ({ id, params, notas }) => listarTarefas(id, params, notas));
