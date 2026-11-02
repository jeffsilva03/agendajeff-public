import { esquemas } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { dadosDosHabitos } from "@/lib/api/servicos/habitos";

export const dynamic = "force-dynamic";

/** Hábitos ativos, sequências, adesão, estado numa data e histórico (até 92 dias). */
export const GET = rotaDeLeitura("habits", esquemas.habitos, ({ id, params }) => dadosDosHabitos(id, params));
