import { esquemas } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { semanaConsolidada } from "@/lib/api/servicos/agenda";

export const dynamic = "force-dynamic";

/** Semana (segunda a domingo) que contém `date`; sem data, a semana do Planejar a semana. */
export const GET = rotaDeLeitura("week", esquemas.semana, ({ id, params }) => semanaConsolidada(id, params.date));
