import { esquemas } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { listarCandidaturas } from "@/lib/api/servicos/carreira";

export const dynamic = "force-dynamic";

/** Candidaturas, resumo por status e próximas etapas (notas só para o próprio usuário, com include=notes). */
export const GET = rotaDeLeitura("applications", esquemas.candidaturas, ({ id, params, notas }) => listarCandidaturas(id, params, notas));
