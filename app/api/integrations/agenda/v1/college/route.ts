import { esquemas } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { dadosDaFaculdade } from "@/lib/api/servicos/faculdade";

export const dynamic = "force-dynamic";

/** Semestre, disciplinas, grade, aulas de uma data e avaliações (notas e médias só com include=grades). */
export const GET = rotaDeLeitura("college", esquemas.faculdade, ({ id, params, notas }) => dadosDaFaculdade(id, {
  date: params.date, assessments: params.assessments, type: params.type, semester: params.semester,
  grades: !!params.include?.includes("grades"), notes: notas,
}));
