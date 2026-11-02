// Insights: as mesmas análises da tela, com os mesmos limiares. Análise sem dados suficientes
// volta como indisponível (com quantos dias faltam), nunca como número estimado.
import {
  adesaoPorDiaSemana, adesaoPorHabito, adesaoPorPeriodo, agoraSP, coocorrencia, diasComRegistro, estadoLimiar,
  focoPorSemana, quebraDeCadeia, revisaoSemanal, somarDias, type Analise,
} from "@motor";
import { carregarChecks } from "@/lib/dados";
import type { Identidade } from "../auth";
import { DIA_SEMANA, PERIODO } from "../formatos";
import { contextoDo } from "./comum";

const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);

export async function dadosDeInsights(id: Identidade) {
  const hoje = agoraSP().data;
  const ctx = await contextoDo(id);
  const inicio = ctx.inicioRastreamento ?? hoje;
  const de = inicio < hoje ? inicio : hoje;
  const [checks, focos] = await Promise.all([
    carregarChecks(id.sb, de, hoje),
    id.sb.from("focos").select("data_local, minutos").gte("data_local", somarDias(hoje, -62)),
  ]);
  if (focos.error) throw new Error(`focos: ${focos.error.code ?? ""}`);
  const dias = diasComRegistro(checks);
  const nome = new Map(ctx.habitos.map((h) => [h.id, h.nome]));
  const minimos = new Map(ctx.cadeias.flatMap((c) => c.passos.map((p) => [p.habitoId, p.minimo] as [string, string | null])));

  const analise = <T>(qual: Analise, calcular: () => T) => {
    const e = estadoLimiar(qual, dias);
    return e.pronto
      ? { available: true as const, requiredDays: e.exige, data: calcular() }
      : { available: false as const, reason: "insufficient_data", requiredDays: e.exige, recordedDays: dias, missingDays: e.faltam };
  };
  const revisao = revisaoSemanal(ctx, checks, hoje, minimos);
  const semanasFoco = focoPorSemana((focos.data ?? []).map((f) => ({ data: f.data_local, minutos: f.minutos })), hoje);

  return {
    today: hoje,
    trackingStart: inicio,
    daysWithRecords: dias,
    rules: "Cada análise só aparece com dias suficientes de registro. Dias sem nenhum registro e \"não se aplica\" ficam fora das contas.",
    lastSevenDays: {
      start: revisao.de, end: revisao.ate, done: revisao.feitos, total: revisao.total, adherence: pct(revisao.adesao),
      byHabit: revisao.porHabito.map((h) => ({ habitId: h.habitoId, name: nome.get(h.habitoId) ?? null, done: h.feitos, total: h.total, adherence: pct(h.adesao) })),
      suggestion: { type: revisao.sugestao.tipo, habitId: revisao.sugestao.habitoId, text: revisao.sugestao.texto },
    },
    adherenceByHabit: analise("adesao", () => adesaoPorHabito(ctx, checks, de, hoje).filter((h) => h.diasQueValeram > 0)
      .sort((a, b) => (b.adesao ?? 0) - (a.adesao ?? 0))
      .map((h) => ({ habitId: h.habitoId, name: nome.get(h.habitoId) ?? null, adherence: pct(h.adesao), scheduledDays: h.diasQueValeram, currentStreak: h.sequenciaAtual }))),
    chainBreaks: analise("quebra", () => quebraDeCadeia(ctx, checks, de, hoje).map((q) => ({
      chainId: q.cadeiaId, chain: ctx.cadeias.find((c) => c.id === q.cadeiaId)?.nome ?? null, days: q.dias, completed: q.completas,
      stoppedAt: q.paradas.map((s) => ({ habitId: s.habitoId, name: nome.get(s.habitoId) ?? null, times: s.vezes })),
    }))),
    adherenceByPeriod: analise("periodo", () => adesaoPorPeriodo(ctx, checks, de, hoje).filter((p) => p.total > 0)
      .map((p) => ({ period: PERIODO[p.periodo], done: p.feitos, total: p.total, adherence: pct(p.adesao) }))),
    adherenceByWeekday: analise("diaSemana", () => adesaoPorDiaSemana(ctx, checks, de, hoje)
      .map((d) => ({ weekday: DIA_SEMANA[d.diaSemana], done: d.feitos, total: d.total, adherence: pct(d.adesao) }))),
    habitPairs: analise("coocorrencia", () => coocorrencia(ctx, checks, de, hoje).map((p) => ({
      habitA: nome.get(p.a) ?? null, habitB: nome.get(p.b) ?? null, days: p.dias,
      rateBWhenADone: pct(p.pComA), rateBWhenANotDone: pct(p.pSemA), difference: pct(p.diferenca),
    }))),
    focusTime: {
      weeks: semanasFoco.map((s) => ({ weekStart: s.de, minutes: s.minutos, sessions: s.sessoes })),
      hasSessions: semanasFoco.some((s) => s.sessoes > 0),
    },
  };
}
