import { describe, expect, it } from "vitest";
import { avaliacaoParaEvento, conteudoLembrete, ocorrenciasDePrazos, resolverDia, type AulaHorario } from "@motor";
import { normalizar, type DadosIniciais } from "@/lib/importar-dados";
import dados from "../fixtures/dados-exemplo.json";

const base = normalizar(dados as unknown as DadosIniciais);
const aula = (diaSemana: number, inicio: string, fim: string, disciplina = "Banco de Dados"): AulaHorario => ({
  id: `${disciplina}-${diaSemana}`, disciplinaId: disciplina, disciplina, cor: "azul", sala: "Sala 12", professor: null,
  diaSemana, inicio, fim, semestreInicio: "2026-08-01", semestreFim: "2026-12-10",
});
const ctx = { ...base, aulas: [aula(3, "18:30", "20:30"), aula(3, "20:40", "22:50", "Engenharia de Software"), aula(4, "18:30", "22:50", "Redes")] };

describe("aulas do cronograma", () => {
  it("quarta 14/10 tem as duas aulas, em ordem", () => {
    expect(resolverDia("2026-10-14", ctx).aulas.map((a) => a.disciplina)).toEqual(["Banco de Dados", "Engenharia de Software"]);
  });
  it("somem em feriado (12/10 é segunda, 02/11 também) e em exceção 'Sem aula'", () => {
    const quarta = { ...ctx, eventos: [...ctx.eventos, { id: "x", tipo: "excecao_rotina" as const, titulo: "Sem aula", data: "2026-10-21", inicio: null, fim: null, local: null, recorrencia: null, lembretesDias: [], lembretesAPartirDe: null, efeito: { sem_aula: true } }] };
    expect(resolverDia("2026-10-21", quarta).aulas).toEqual([]);
    const feriadoQuinta = { ...ctx, feriados: [...ctx.feriados, { data: "2026-10-15", nome: "Teste", ativo: true }] };
    expect(resolverDia("2026-10-15", feriadoQuinta).aulas).toEqual([]);
  });
  it("só valem dentro do semestre", () => {
    expect(resolverDia("2026-12-16", ctx).aulas).toEqual([]); // quarta depois de 10/12
    expect(resolverDia("2026-12-09", ctx).aulas).toHaveLength(2);
  });
});

describe("avaliações", () => {
  const prova = { id: "p1", tipo: "prova" as const, titulo: "P1", data: "2026-10-28", hora: "19:00", disciplina: "Banco de Dados", entregue: false };
  it("viram prazo com lembretes 3 e 1 dia antes (prova)", () => {
    const e = avaliacaoParaEvento(prova)!;
    expect(e.titulo).toBe("Prova: P1 (Banco de Dados)");
    expect(ocorrenciasDePrazos([e], "2026-10-20", "2026-10-31").map((o) => `${o.data}:${o.tipo}`))
      .toEqual(["2026-10-25:lembrete", "2026-10-27:lembrete", "2026-10-28:prazo"]);
  });
  it("atividade avisa só na véspera; entregue sai da agenda", () => {
    const at = avaliacaoParaEvento({ ...prova, tipo: "atividade", titulo: "Lista 3" })!;
    expect(at.lembretesAntes).toEqual([1]);
    expect(avaliacaoParaEvento({ ...prova, entregue: true })).toBeNull();
  });
  it("lembrete das 8h cita a prova 3 dias antes", () => {
    const c2 = { ...ctx, eventos: [...ctx.eventos, avaliacaoParaEvento(prova)!] };
    expect(conteudoLembrete("08:00", resolverDia("2026-10-25", c2), [], c2.habitos)?.corpo).toContain("Lembrete: Prova: P1 (Banco de Dados) (prazo 28/10)");
  });
});

describe("tarefas nos lembretes", () => {
  it("entram de manhã e à noite, não à tarde", () => {
    const d = resolverDia("2026-10-17", ctx); // sábado: sem cadeia de manhã
    expect(conteudoLembrete("08:00", d, [], ctx.habitos, ["Comprar passe", "Lavar roupa"])?.corpo).toBe("Tarefas: Comprar passe, Lavar roupa");
    expect(conteudoLembrete("13:00", d, [], ctx.habitos, ["Comprar passe"])?.corpo).not.toContain("Comprar passe");
    expect(conteudoLembrete("08:00", d, [], ctx.habitos, ["a", "b", "c", "d", "e"])?.corpo).toBe("Tarefas: a, b, c e mais 2");
  });
});
