// Dias sem aula e faltas: funções puras (testadas em tests/api/faltas.test.ts).
import { diaDaSemana, diasEntre, somarDias } from "@motor";

export interface Falta { id: string; data: string; disciplina_id: string; motivo: string | null; evento_id: string | null }

/** Aula cadastrada na grade, no formato mínimo que estas funções usam. */
export interface AulaDaGrade { disciplinaId: string; disciplina: string; diaSemana: number; inicio: string; semestreInicio: string; semestreFim: string }

/** Disciplinas com aula na data (dia da semana e dentro do semestre), na ordem do horário, sem repetir. */
export function disciplinasDoDia(aulas: AulaDaGrade[], data: string): { id: string; nome: string }[] {
  const w = diaDaSemana(data);
  const vistas = new Set<string>();
  return aulas
    .filter((a) => a.diaSemana === w && data >= a.semestreInicio && data <= a.semestreFim)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .filter((a) => !vistas.has(a.disciplinaId) && vistas.add(a.disciplinaId))
    .map((a) => ({ id: a.disciplinaId, nome: a.disciplina }));
}

export const LIMITE_DIAS_SEM_AULA = 60;

/**
 * Dias de um período sem aula (recesso, greve, semana de provas…): só os que teriam aula na grade
 * ou, sem grade cadastrada, os dias úteis. No máximo 60 dias.
 */
export function diasDoPeriodo(inicio: string, fim: string, aulas: AulaDaGrade[]): string[] {
  if (fim < inicio || diasEntre(inicio, fim) >= LIMITE_DIAS_SEM_AULA) return [];
  const dias: string[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    const temGrade = aulas.length > 0;
    if (temGrade ? disciplinasDoDia(aulas, d).length > 0 : diaDaSemana(d) >= 1 && diaDaSemana(d) <= 5) dias.push(d);
  }
  return dias;
}

/** Faltas por disciplina. */
export function faltasPorDisciplina(faltas: Pick<Falta, "disciplina_id">[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of faltas) m.set(f.disciplina_id, (m.get(f.disciplina_id) ?? 0) + 1);
  return m;
}

/** Sugestões rápidas de motivo para dia sem aula. */
export const MOTIVOS_SEM_AULA = ["Professor faltou", "Feriado ou ponte", "Evento da faculdade", "Aula cancelada", "Greve", "Recesso"];
