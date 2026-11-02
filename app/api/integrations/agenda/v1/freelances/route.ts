import { esquemas } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { listarFreelas } from "@/lib/api/servicos/carreira";

export const dynamic = "force-dynamic";

/** Freelas, horas registradas, valores a receber e próximas entregas. */
export const GET = rotaDeLeitura("freelances", esquemas.freelas, ({ id, params, notas }) => listarFreelas(id, params, notas));
