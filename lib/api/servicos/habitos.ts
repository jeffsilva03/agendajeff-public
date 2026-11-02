// Hábitos: o mesmo cálculo da aba Progresso (progressoHabitos → historico/resumir do motor).
import { agoraSP, diasEntre, progressoHabitos, resolverDia, META_DIAS } from "@motor";
import { carregarChecks } from "@/lib/dados";
import type { Identidade } from "../auth";
import { ESTADO_DIA, PERIODO } from "../formatos";
import { ErroApi } from "../respostas";
import { LIMITES, validarIntervalo } from "../parametros";
import { contextoDo } from "./comum";

export interface FiltroHabitos { date?: string; start?: string; end?: string; habitId?: string }

export async function dadosDosHabitos(id: Identidade, f: FiltroHabitos) {
  if ((f.start && !f.end) || (!f.start && f.end)) throw new ErroApi("parametro_invalido", [{ param: f.start ? "end" : "start", message: "informe start e end juntos" }]);
  if (f.start && f.end) validarIntervalo(f.start, f.end, LIMITES.historicoDias);
  const hoje = agoraSP().data;
  const ctx = await contextoDo(id);
  if (f.habitId && !ctx.habitos.some((h) => h.id === f.habitId)) throw new ErroApi("nao_encontrado");
  const inicio = ctx.inicioRastreamento ?? hoje;
  const checks = await carregarChecks(id.sb, inicio < hoje ? inicio : hoje, hoje);
  const p = progressoHabitos(ctx, checks, hoje);
  const minimo = new Map<string, { minimum: string | null; full: string | null }>();
  for (const c of ctx.cadeias) for (const s of c.passos) if (!minimo.has(s.habitoId)) minimo.set(s.habitoId, { minimum: s.minimo, full: s.completo });

  const escolhidos = p.habitos.filter((h) => !f.habitId || h.habitoId === f.habitId);
  const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);

  // Estado de cada hábito numa data (ex.: "o que deixei de cumprir ontem").
  let naData = null;
  if (f.date) {
    if (f.date > hoje) {
      const dia = resolverDia(f.date, ctx);
      naData = { date: f.date, future: true, scheduled: [...dia.cadeias.flatMap((c) => c.passos.map((s) => ({ habitId: s.habitoId, chain: c.nome, period: PERIODO[c.periodo] }))), ...dia.flexiveis.map((h) => ({ habitId: h.id, chain: null, period: "anytime" }))] };
    } else if (f.date < p.inicio) {
      naData = { date: f.date, trackingStarted: false, message: `O acompanhamento começa em ${p.inicio}.` };
    } else {
      naData = {
        date: f.date,
        dayHadRecords: checks.some((c) => c.data === f.date),
        habits: escolhidos.map((h) => ({ habitId: h.habitoId, name: h.nome, state: ESTADO_DIA[h.linha.find((d) => d.data === f.date)?.estado ?? "fora"] }))
          .filter((h) => h.state !== "not_scheduled"),
      };
    }
  }

  return {
    today: hoje,
    tracking: { start: p.inicio, started: p.comecou, daysWithRecords: p.diasComRegistro },
    rules: {
      goalDays: META_DIAS,
      adherence: "(feito + mínimo) / dias em que o hábito valia. \"Não se aplica\", dias em que não valia e dias sem nenhum registro ficam fora.",
      streak: "Dias seguidos com feito ou mínimo. \"Não se aplica\" não quebra; dia sem registro quebra. Hoje ainda pendente não conta contra.",
    },
    summary: {
      lastSevenDaysAdherence: p.adesao7.total ? { done: p.adesao7.feitos, total: p.adesao7.total, rate: pct(p.adesao7.adesao) } : null,
      longestCurrentStreak: p.maiorSequencia?.resumo.sequenciaAtual ? { habitId: p.maiorSequencia.habitoId, name: p.maiorSequencia.nome, days: p.maiorSequencia.resumo.sequenciaAtual } : null,
      closestToGoal: p.maisPertoDaMeta?.resumo.diasPraticados ? { habitId: p.maisPertoDaMeta.habitoId, name: p.maisPertoDaMeta.nome, daysPracticed: p.maisPertoDaMeta.resumo.diasPraticados } : null,
      insufficientData: p.diasComRegistro === 0,
    },
    habits: escolhidos.map((h) => ({
      habitId: h.habitoId,
      name: h.nome,
      chains: h.cadeias,
      flexible: h.flexivel,
      minimum: minimo.get(h.habitoId)?.minimum ?? null,
      full: minimo.get(h.habitoId)?.full ?? null,
      currentStreak: h.resumo.sequenciaAtual,
      bestStreak: h.resumo.melhorSequencia,
      daysPracticed: h.resumo.diasPraticados,
      goalProgress: { daysPracticed: h.resumo.diasPraticados, goalDays: META_DIAS },
      overall: { scheduledDays: h.resumo.diasQueValeram, done: h.resumo.completos, minimum: h.resumo.minimos, notDone: h.resumo.naoFeitos, adherence: pct(h.resumo.adesao) },
      lastSevenDays: { scheduledDays: h.resumo7.diasQueValeram, done: h.resumo7.completos, minimum: h.resumo7.minimos, notDone: h.resumo7.naoFeitos, adherence: pct(h.resumo7.adesao) },
      ...(f.start && f.end ? {
        history: h.linha.filter((d) => d.data >= f.start! && d.data <= f.end!).map((d) => ({ date: d.data, state: ESTADO_DIA[d.estado] })),
      } : {}),
    })),
    stateOnDate: naData,
    ...(f.start && f.end ? { historyRange: { start: f.start, end: f.end, note: diasEntre(p.inicio, f.start) < 0 ? `Antes de ${p.inicio} não há acompanhamento.` : null } } : {}),
  };
}
