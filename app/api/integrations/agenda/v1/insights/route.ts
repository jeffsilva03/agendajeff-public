import { esquemas } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { dadosDeInsights } from "@/lib/api/servicos/insights";

export const dynamic = "force-dynamic";

/** Análises da tela Insights; as que ainda não têm dias suficientes voltam como indisponíveis. */
export const GET = rotaDeLeitura("insights", esquemas.insights, ({ id }) => dadosDeInsights(id));
