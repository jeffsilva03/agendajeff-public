import { describe, expect, it } from "vitest";
import {
  antesDaJanela, blocoDaVez, jaPassou, mediaNotas, momentoDaCadeia, prazosDoHoje, progressoHabitos, resolverDia, resumoFreelas, semestreAtual,
  type Cadeia, type Contexto, type StatusCheck,
} from "@motor";

// Contexto fictício (não usa dados reais): duas cadeias num dia útil e um flexível.
const cadeia = (id: string, nome: string, ini: string | null, fim: string | null, habitos: string[], ordem: number): Cadeia => ({
  id, nome, ancora: "", diasSemana: [1, 2, 3, 4, 5], dependeAula: false, periodo: "manha", janelaInicio: ini, janelaFim: fim,
  naoAntes: null, lembrete: true, ordem,
  passos: habitos.map((h, i) => ({ id: `${id}-${i}`, habitoId: h, posicao: i + 1, gatilho: "depois de", minimo: `mín ${h}`, completo: null, naoAntes: null })),
});
const ctx: Contexto & { inicioRastreamento: string } = {
  habitos: ["a", "b", "c", "f"].map((id) => ({ id, nome: id.toUpperCase() })),
  cadeias: [cadeia("manha", "Manhã", "07:00", "12:00", ["a", "b"], 1), cadeia("noite", "Noite", "22:00", "01:00", ["c"], 2)],
  regrasFlex: [{ contexto: "fim_de_semana", habitoIds: ["f"] }],
  eventos: [],
  feriados: [],
  diasDeAula: [1, 2, 3, 4, 5],
  inicioRastreamento: "2026-10-05",
};

describe("momento da cadeia", () => {
  const manha = ctx.cadeias[0], noite = ctx.cadeias[1];
  it("antes, durante e depois da janela", () => {
    expect(momentoDaCadeia(manha, "06:30")).toBe("a_seguir");
    expect(momentoDaCadeia(manha, "09:00")).toBe("agora");
    expect(momentoDaCadeia(manha, "12:00")).toBe("passou");
  });
  it("janela que cruza a meia-noite nunca passa no mesmo dia", () => {
    expect(jaPassou(noite, "23:59")).toBe(false);
    expect(antesDaJanela(noite, "00:30")).toBe(false);
    expect(antesDaJanela(noite, "20:00")).toBe(true);
  });
  it("sem hora (outra data) não decide nada", () => {
    expect(jaPassou(manha, null)).toBe(false);
    expect(antesDaJanela(manha, null)).toBe(false);
  });
});

describe("bloco da vez (igual ao Hoje)", () => {
  const dia = resolverDia("2026-10-14", ctx); // quarta
  const st = (m: Record<string, StatusCheck>) => (h: string) => m[h];
  it("primeira cadeia aberta com pendência", () => {
    expect(blocoDaVez(dia, st({}), "08:00")).toEqual({ tipo: "cadeia", cadeiaId: "manha", momento: "agora" });
  });
  it("cadeia que já passou cede a vez para a próxima aberta", () => {
    expect(blocoDaVez(dia, st({}), "13:00")).toEqual({ tipo: "cadeia", cadeiaId: "noite", momento: "a_seguir" });
  });
  it("sem nada aberto, volta para a que ficou para trás", () => {
    expect(blocoDaVez(dia, st({ c: "completo" }), "13:00")).toEqual({ tipo: "cadeia", cadeiaId: "manha", momento: "passou" });
  });
  it("não se aplica conta como registrado; tudo registrado = null", () => {
    expect(blocoDaVez(dia, st({ a: "completo", b: "nao_se_aplica", c: "minimo" }), "13:00")).toBeNull();
  });
});

describe("prazos do Hoje", () => {
  it("lembrete do dia não repete o prazo que já aparece adiante", () => {
    const eventos = [{ id: "p1", tipo: "prazo" as const, titulo: "Entrega", data: "2026-10-20", inicio: null, fim: null, local: null, recorrencia: null, lembretesDias: [], lembretesAntes: [6], lembretesAPartirDe: null, efeito: null }];
    const c2 = { ...ctx, eventos };
    const lista = prazosDoHoje(eventos, resolverDia("2026-10-14", c2), "2026-10-14");
    expect(lista.map((p) => [p.tipo, p.data, p.faltam])).toEqual([["prazo", "2026-10-20", 6]]);
  });
});

describe("progresso dos hábitos", () => {
  it("resume por hábito e aponta a maior sequência sem inventar nada", () => {
    const checks = [
      { habitoId: "a", data: "2026-10-12", status: "completo" as const },
      { habitoId: "a", data: "2026-10-13", status: "minimo" as const },
      { habitoId: "b", data: "2026-10-13", status: "nao_se_aplica" as const },
    ];
    const p = progressoHabitos(ctx, checks, "2026-10-13");
    const a = p.habitos.find((h) => h.habitoId === "a")!;
    expect(a.resumo.sequenciaAtual).toBe(2);
    expect(a.cadeias).toEqual(["Manhã"]);
    expect(p.maiorSequencia?.habitoId).toBe("a");
    expect(p.diasComRegistro).toBe(2);
    const b = p.habitos.find((h) => h.habitoId === "b")!;
    expect(b.resumo.naoFeitos).toBe(1); // dia 12 teve registro e b não foi marcado; dia 13 "não se aplica" não conta
  });
  it("antes do início do acompanhamento", () => {
    const p = progressoHabitos({ ...ctx, inicioRastreamento: "2026-11-01" }, [], "2026-10-13");
    expect(p.comecou).toBe(false);
    expect(p.adesao7.adesao).toBeNull();
  });
});

describe("freelas e faculdade", () => {
  it("resumo de freelas: horas do mês, a receber (entregue) e recebido (pago)", () => {
    const r = resumoFreelas(
      [{ id: "1", status: "entregue", valor: "1500.00" }, { id: "2", status: "pago", valor: 300 }, { id: "3", status: "cancelado", valor: 999 }, { id: "4", status: "entregue", valor: null }],
      [{ freela_id: "1", data_local: "2026-10-02", horas: "2.5" }, { freela_id: "1", data_local: "2026-09-30", horas: 4 }],
      "2026-10-14",
    );
    expect(r).toMatchObject({ horasMes: 2.5, aReceber: 1500, recebido: 300 });
    expect(r.horasPorFreela.get("1")).toBe(6.5);
  });
  it("média simples e semestre em andamento", () => {
    expect(mediaNotas([])).toBeNull();
    expect(mediaNotas([7, 8.5])).toBe(7.75);
    const sems = [{ id: "s2", inicio: "2026-08-01", fim: "2026-12-10" }, { id: "s1", inicio: "2026-02-01", fim: "2026-06-30" }];
    expect(semestreAtual(sems, "2026-10-14")?.id).toBe("s2");
    expect(semestreAtual(sems, "2026-07-10")?.id).toBe("s2"); // nenhum em andamento: o mais recente (como a tela)
    expect(semestreAtual([], "2026-07-10")).toBeNull();
  });
});
