import { describe, expect, it } from "vitest";
import { diasDoPeriodo, disciplinasDoDia, faltasPorDisciplina, type AulaDaGrade } from "@/lib/faltas";

// Grade fictícia: segunda e sexta, semestre de 03/08 a 10/12/2026.
const sem = { semestreInicio: "2026-08-03", semestreFim: "2026-12-10" };
const AULAS: AulaDaGrade[] = [
  { disciplinaId: "nuvem", disciplina: "Nuvem", diaSemana: 1, inicio: "19:00", ...sem },
  { disciplinaId: "nuvem", disciplina: "Nuvem", diaSemana: 1, inicio: "20:50", ...sem },
  { disciplinaId: "auto", disciplina: "Automação", diaSemana: 5, inicio: "19:00", ...sem },
];

describe("faltas e dias sem aula", () => {
  it("disciplinas do dia respeitam o dia da semana e o semestre", () => {
    expect(disciplinasDoDia(AULAS, "2026-10-19")).toEqual([{ id: "nuvem", nome: "Nuvem" }]); // segunda, sem repetir
    expect(disciplinasDoDia(AULAS, "2026-10-20")).toEqual([]); // terça
    expect(disciplinasDoDia(AULAS, "2026-12-14")).toEqual([]); // segunda depois do semestre
  });
  it("período sem aula pega só os dias com aula na grade (ou dias úteis sem grade)", () => {
    expect(diasDoPeriodo("2026-10-19", "2026-10-25", AULAS)).toEqual(["2026-10-19", "2026-10-23"]);
    expect(diasDoPeriodo("2026-10-19", "2026-10-25", [])).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(diasDoPeriodo("2026-10-25", "2026-10-19", AULAS)).toEqual([]);
    expect(diasDoPeriodo("2026-10-01", "2026-12-31", AULAS)).toEqual([]); // mais de 60 dias
  });
  it("conta faltas por disciplina", () => {
    expect([...faltasPorDisciplina([{ disciplina_id: "a" }, { disciplina_id: "a" }, { disciplina_id: "b" }])]).toEqual([["a", 2], ["b", 1]]);
  });
});
