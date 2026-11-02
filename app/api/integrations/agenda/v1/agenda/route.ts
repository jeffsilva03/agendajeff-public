import { esquemas, validarIntervalo } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { agendaPorPeriodo } from "@/lib/api/servicos/agenda";

export const dynamic = "force-dynamic";

/** Agenda dia a dia entre start e end (até 62 dias). */
export const GET = rotaDeLeitura("agenda", esquemas.agenda, ({ id, params }) => {
  validarIntervalo(params.start, params.end);
  return agendaPorPeriodo(id, params.start, params.end);
});
