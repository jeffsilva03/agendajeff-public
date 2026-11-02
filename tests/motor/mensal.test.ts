import { describe, expect, it } from "vitest";
import {
  areasParaPlano, ehUltimoDiaDoMes, fimDoMes, fraseDoMomento, gap, horariosPeriodicos, horarioVencido, inicioDoMes,
  progressoMeta, quadrante, resumoDoMes, resumoRaiox, somarMeses, tipoGap, type Contexto, type Meta,
} from "@motor";

describe("datas do mês", () => {
  it("início, fim, soma de meses e último dia", () => {
    expect(inicioDoMes("2026-10-19")).toBe("2026-10-01");
    expect(fimDoMes("2026-02-01")).toBe("2026-02-28");
    expect(fimDoMes("2028-02-01")).toBe("2028-02-29");
    expect(somarMeses("2026-12-01", 1)).toBe("2027-01-01");
    expect(somarMeses("2026-01-01", -1)).toBe("2025-12-01");
    expect(ehUltimoDiaDoMes("2026-10-31")).toBe(true);
    expect(ehUltimoDiaDoMes("2026-10-30")).toBe(false);
  });
});

describe("Raio-X", () => {
  const notas = [
    { areaId: "a", nome: "Lazer", importancia: 8, acao: 2 },
    { areaId: "b", nome: "Autocuidado", importancia: 10, acao: 5 },
    { areaId: "c", nome: "Amizades", importancia: 8, acao: 4 },
    { areaId: "d", nome: "Família", importancia: 9, acao: 6 },
    { areaId: "e", nome: "Trabalho", importancia: 8, acao: 10 },
    { areaId: "f", nome: "Sem nota", importancia: null, acao: 3 },
  ];
  it("gap, tipo e quadrante", () => {
    expect(gap(notas[0])).toBe(6);
    expect(gap(notas[5])).toBeNull();
    expect(tipoGap(6)).toBe("atencao");
    expect(tipoGap(2)).toBe("leve");
    expect(tipoGap(-2)).toBe("excesso");
    expect(tipoGap(0)).toBe("equilibrio");
    expect(quadrante(notas[0])).toBe("prioridade");
    expect(quadrante(notas[4])).toBe("em_dia");
    expect(quadrante({ importancia: 3, acao: 8 })).toBe("energia_demais");
    expect(quadrante({ importancia: 3, acao: 2 })).toBe("pode_esperar");
  });
  it("plano: 3 maiores gaps e a área com energia demais", () => {
    expect(areasParaPlano(notas).map((n) => n.nome)).toEqual(["Lazer", "Autocuidado", "Amizades", "Trabalho"]);
  });
  it("resumo ignora áreas sem as duas notas", () => {
    expect(resumoRaiox(notas)).toMatchObject({ avaliadas: 5, emAtencao: 4 });
    expect(resumoRaiox(notas).gapMedio).toBeCloseTo((6 + 5 + 4 + 3 + 2) / 5);
  });
});

describe("metas do mês", () => {
  const base: Meta = { id: "m", mes: "2026-10-01", titulo: "Ler", tipo: "contagem", alvo: 4, progresso: 2, unidade: "livros", habitoId: null, areaId: null, comoMedir: null, concluidaEm: null, origem: "manual" };
  it("contagem: no caminho ou atrás pelo ritmo do mês", () => {
    expect(progressoMeta(base, [], "2026-10-10").situacao).toBe("no_caminho"); // esperado ~1,3
    expect(progressoMeta({ ...base, progresso: 1 }, [], "2026-10-25").situacao).toBe("atras"); // esperado ~3,2
    expect(progressoMeta({ ...base, progresso: 4 }, [], "2026-10-25")).toMatchObject({ situacao: "concluida", pct: 1 });
    expect(progressoMeta({ ...base, progresso: 1 }, [], "2026-11-02").situacao).toBe("encerrada");
  });
  it("hábito: conta dias do mês com feito ou mínimo (um por dia)", () => {
    const checks = [
      { habitoId: "h", data: "2026-10-02", status: "completo" as const },
      { habitoId: "h", data: "2026-10-03", status: "minimo" as const },
      { habitoId: "h", data: "2026-10-04", status: "nao_feito" as const },
      { habitoId: "h", data: "2026-09-30", status: "completo" as const },
      { habitoId: "x", data: "2026-10-05", status: "completo" as const },
    ];
    expect(progressoMeta({ ...base, tipo: "habito", habitoId: "h", alvo: 20 }, checks, "2026-10-05").atual).toBe(2);
  });
  it("marco e meta sem alvo", () => {
    expect(progressoMeta({ ...base, tipo: "marco", alvo: null, concluidaEm: "2026-10-03T10:00:00Z" }, [], "2026-10-05").situacao).toBe("concluida");
    expect(progressoMeta({ ...base, alvo: null }, [], "2026-10-05").situacao).toBe("sem_alvo");
  });
});

describe("resumo do mês", () => {
  const ctx: Contexto & { inicioRastreamento: string } = {
    habitos: [{ id: "h", nome: "Ler" }],
    cadeias: [{ id: "c", nome: "Manhã", ancora: "", diasSemana: [0, 1, 2, 3, 4, 5, 6], dependeAula: false, periodo: "manha", janelaInicio: null, janelaFim: null, naoAntes: null, lembrete: true, ordem: 1,
      passos: [{ id: "p", habitoId: "h", posicao: 1, gatilho: "", minimo: null, completo: null, naoAntes: null }] }],
    regrasFlex: [], eventos: [], feriados: [], diasDeAula: [], inicioRastreamento: "2026-10-10",
  };
  it("começa no início do acompanhamento e não conta dias sem registro", () => {
    const r = resumoDoMes(ctx, [{ habitoId: "h", data: "2026-10-10", status: "completo" }, { habitoId: "h", data: "2026-10-11", status: "nao_feito" }], "2026-10-01", "2026-10-12");
    expect(r).toMatchObject({ de: "2026-10-10", ate: "2026-10-12", diasComRegistro: 2, adesao: 0.5 });
  });
  it("mês antes do acompanhamento", () => {
    expect(resumoDoMes(ctx, [], "2026-09-01", "2026-10-12").comecou).toBe(false);
  });
});

describe("lembretes periódicos", () => {
  it("horários a cada 2 h e o que acabou de vencer", () => {
    const h = horariosPeriodicos("08:00", "22:00", 120);
    expect(h).toEqual(["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"]);
    expect(horarioVencido(h, "10:12")).toBe("10:00");
    expect(horarioVencido(h, "10:45")).toBeNull();
    expect(horariosPeriodicos("22:00", "08:00", 120)).toEqual([]);
  });
  it("frase personalizada e estável para o mesmo horário", () => {
    const c = { hora: "10:00", pendentes: 3, sequencia: { nome: "Leitura", dias: 6 }, proximoHabito: "Estudo Tech", proprias: ["Bora, Jeff!"] };
    const f = fraseDoMomento(c, "2026-10-19|10:00");
    expect(fraseDoMomento(c, "2026-10-19|10:00")).toBe(f);
    const todas = new Set(Array.from({ length: 40 }, (_, i) => fraseDoMomento(c, `s${i}`)));
    expect([...todas].some((x) => x.includes("6 dias seguidos de Leitura"))).toBe(true);
    expect([...todas]).toContain("Bora, Jeff!");
  });
});

describe("banco de frases", () => {
  it("tem mais de 100 frases curtas, sem repetir, e mistura com as personalizadas", async () => {
    const { FRASES_MANHA, FRASES_TARDE, FRASES_NOITE, FRASES_GERAIS, frasesDoHorario } = await import("@motor");
    const todas = [...FRASES_MANHA, ...FRASES_TARDE, ...FRASES_NOITE, ...FRASES_GERAIS];
    expect(todas.length).toBeGreaterThanOrEqual(100);
    expect(new Set(todas).size).toBe(todas.length);
    expect(todas.every((f) => f.length <= 90)).toBe(true);
    expect(frasesDoHorario("07:00")).toContain(FRASES_MANHA[0]);
    expect(frasesDoHorario("21:00")).not.toContain(FRASES_MANHA[0]);
    const c = { hora: "14:00", pendentes: 3, sequencia: { nome: "Leitura", dias: 6 } };
    const saidas = Array.from({ length: 200 }, (_, i) => fraseDoMomento(c, `2026-10-19|${i}`));
    const pessoais = saidas.filter((s) => s.includes("6 dias seguidos")).length;
    expect(pessoais).toBeGreaterThan(40); // ~40%
    expect(pessoais).toBeLessThan(120);
    expect(new Set(saidas).size).toBeGreaterThan(30); // variedade
  });
});
