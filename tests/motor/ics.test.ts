import { describe, expect, it } from "vitest";
import { gerarIcs } from "@/lib/ics";
import { normalizar, type DadosIniciais } from "@/lib/importar-dados";
import dados from "../fixtures/dados-exemplo.json";

const ctx = normalizar(dados as unknown as DadosIniciais);
const ics = gerarIcs(ctx, "2026-10-09", "20261009T120000Z");
const linhas = ics.split("\r\n");

describe("feed do calendário", () => {
  it("estrutura válida e linhas de no máximo 75 octetos", () => {
    expect(linhas[0]).toBe("BEGIN:VCALENDAR");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(linhas.filter((l) => l === "BEGIN:VEVENT").length).toBe(linhas.filter((l) => l === "END:VEVENT").length);
    for (const l of linhas) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
  it("reunião de 13/10 às 13h com local e sem término", () => {
    expect(ics).toContain("DTSTART;TZID=America/Sao_Paulo:20261013T130000");
    expect(ics).toContain("LOCATION:Sala de exemplo");
    expect(ics).toContain("DESCRIPTION:Sem horário de término");
  });
  it("dias sem aula (exceção e feriado) e prazo recorrente de exemplo em 10/11", () => {
    expect(ics).toContain("SUMMARY:Sem aula (feriado de N. Sra. Aparecida)");
    expect(ics).toContain("SUMMARY:Sem aula (Feriado: Finados)");
    expect(ics).toMatch(/DTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261111\r\nSUMMARY:Prazo: revisão mensal/);
  });
  it("vírgulas e ponto e vírgula escapados", () => {
    const c2 = { ...ctx, eventos: [{ id: "x", tipo: "compromisso" as const, titulo: "Prova; cap. 1, 2", data: "2026-10-20", inicio: "19:00", fim: "20:00", local: null, recorrencia: null, lembretesDias: [], lembretesAPartirDe: null, efeito: null }] };
    expect(gerarIcs(c2, "2026-10-09", "20261009T120000Z")).toContain(String.raw`SUMMARY:Prova\; cap. 1\, 2`);
  });
});

describe("aulas no feed", () => {
  it("cada aula vira um evento com sala; some em feriado", () => {
    const c2 = { ...ctx, aulas: [{ id: "a1", disciplinaId: "d1", disciplina: "Redes", cor: "azul", sala: "Lab 3", professor: "Ana", diaSemana: 1, inicio: "18:30", fim: "22:50", semestreInicio: "2026-08-01", semestreFim: "2026-12-10" }] };
    const f = gerarIcs(c2, "2026-10-09", "20261009T120000Z");
    expect(f).toContain("DTSTART;TZID=America/Sao_Paulo:20261019T183000");
    expect(f).toContain("LOCATION:Lab 3");
    expect(f).not.toContain("UID:aula-a1-2026-11-02"); // Finados
    expect(f).not.toContain("UID:aula-a1-2026-12-14"); // depois do semestre
  });
});
