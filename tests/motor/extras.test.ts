import { describe, expect, it } from "vitest";
import {
  candidaturaParaEvento, descreverRecorrencia, focoPorSemana, recorrenciaVale, resumoCandidaturas, semanaParaPlanejar,
  type CandidaturaBase, type Recorrencia,
} from "@motor";

const rec = (p: Partial<Recorrencia>): Recorrencia => ({ id: "r", titulo: "x", regra: "diaria", diasSemana: [], diaMes: null, hora: null, prioridade: 0, inicio: "2026-10-01", ativa: true, ...p });

describe("semana para planejar", () => {
  it("no sábado e no domingo, a próxima semana; nos outros dias, a atual", () => {
    expect(semanaParaPlanejar("2026-10-10")).toEqual({ de: "2026-10-12", ate: "2026-10-18" }); // sábado
    expect(semanaParaPlanejar("2026-10-11")).toEqual({ de: "2026-10-12", ate: "2026-10-18" }); // domingo
    expect(semanaParaPlanejar("2026-10-14")).toEqual({ de: "2026-10-12", ate: "2026-10-18" }); // quarta
  });
});

describe("tarefas recorrentes", () => {
  it("diária, semanal e mensal; respeita início e pausa", () => {
    expect(recorrenciaVale(rec({}), "2026-10-14")).toBe(true);
    expect(recorrenciaVale(rec({}), "2026-09-30")).toBe(false); // antes do início
    expect(recorrenciaVale(rec({ ativa: false }), "2026-10-14")).toBe(false);
    expect(recorrenciaVale(rec({ regra: "semanal", diasSemana: [6] }), "2026-10-17")).toBe(true);
    expect(recorrenciaVale(rec({ regra: "semanal", diasSemana: [6] }), "2026-10-18")).toBe(false);
    expect(recorrenciaVale(rec({ regra: "mensal", diaMes: 5 }), "2026-11-05")).toBe(true);
  });
  it("mensal no dia 31 cai no último dia de meses curtos", () => {
    expect(recorrenciaVale(rec({ regra: "mensal", diaMes: 31 }), "2026-11-30")).toBe(true);
    expect(recorrenciaVale(rec({ regra: "mensal", diaMes: 31 }), "2027-02-28")).toBe(true);
    expect(recorrenciaVale(rec({ regra: "mensal", diaMes: 31 }), "2026-10-30")).toBe(false);
  });
  it("descrição legível", () => {
    expect(descreverRecorrencia({ regra: "semanal", diasSemana: [5, 1, 3, 2, 4], diaMes: null })).toBe("dias úteis");
    expect(descreverRecorrencia({ regra: "semanal", diasSemana: [6], diaMes: null })).toBe("sáb");
    expect(descreverRecorrencia({ regra: "mensal", diasSemana: [], diaMes: 10 })).toBe("todo dia 10");
  });
});

describe("candidaturas", () => {
  const c = (p: Partial<CandidaturaBase>): CandidaturaBase => ({ id: "c", empresa: "ACME", vaga: "Estágio", status: "em_processo", dataEnvio: "2026-10-10", proximaAcao: "Entrevista com RH", proximaData: "2026-10-20", proximaHora: "14:00", ...p });
  it("próxima etapa com horário vira compromisso; sem horário, prazo com lembrete na véspera", () => {
    expect(candidaturaParaEvento(c({}))).toMatchObject({ tipo: "compromisso", titulo: "Entrevista com RH: ACME", inicio: "14:00", data: "2026-10-20" });
    expect(candidaturaParaEvento(c({ proximaHora: null }))).toMatchObject({ tipo: "prazo", lembretesAntes: [1] });
  });
  it("encerrada ou sem data não entra na agenda", () => {
    expect(candidaturaParaEvento(c({ status: "recusada" }))).toBeNull();
    expect(candidaturaParaEvento(c({ proximaData: null }))).toBeNull();
  });
  it("resumo: taxa de resposta e envios dos últimos 7 dias", () => {
    const r = resumoCandidaturas([c({ status: "enviada" }), c({ status: "entrevista" }), c({ status: "recusada", dataEnvio: "2026-09-01" })], "2026-10-12");
    expect(r).toMatchObject({ total: 3, respondidas: 2, ultimos7Dias: 2 });
    expect(r.taxaResposta).toBeCloseTo(2 / 3);
  });
});

describe("foco por semana", () => {
  it("soma por semana, da mais antiga para a atual", () => {
    const s = focoPorSemana([{ data: "2026-10-12", minutos: 25 }, { data: "2026-10-14", minutos: 25 }, { data: "2026-10-08", minutos: 50 }], "2026-10-15", 2);
    expect(s).toEqual([{ de: "2026-10-05", minutos: 50, sessoes: 1 }, { de: "2026-10-12", minutos: 50, sessoes: 2 }]);
  });
});
