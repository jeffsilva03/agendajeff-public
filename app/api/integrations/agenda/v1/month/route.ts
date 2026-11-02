import { esquemas } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { dadosDoMes } from "@/lib/api/servicos/mes";

export const dynamic = "force-dynamic";

/** Mês: metas com progresso, Raio-X da vida (notas por área, gaps, compromissos) e revisão mensal com os números. */
export const GET = rotaDeLeitura("month", esquemas.mes, ({ id, params }) => dadosDoMes(id, params.month));
