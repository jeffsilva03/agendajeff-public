// Mês: metas com progresso, Raio-X da vida e revisão mensal (mesmos cálculos da página Mês: progressoMeta,
// resumoDoMes, gap, tipoGap, quadrante e resumoRaiox do motor).
import { agoraSP, fimDoMes, gap, inicioDoMes, progressoMeta, quadrante, resumoDoMes, resumoRaiox, somarMeses, tipoGap, type Meta } from "@motor";
import { carregarChecks } from "@/lib/dados";
import type { Identidade } from "../auth";
import { ErroApi } from "../respostas";
import { contextoDo } from "./comum";

const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);

export async function dadosDoMes(id: Identidade, mesParam?: string) {
  const hoje = agoraSP().data;
  const mes = mesParam ? `${mesParam}-01` : inicioDoMes(hoje);
  if (mes < somarMeses(inicioDoMes(hoje), -24) || mes > somarMeses(inicioDoMes(hoje), 24)) throw new ErroApi("parametro_invalido", [{ param: "month", message: "até 24 meses para cada lado" }]);
  const anterior = somarMeses(mes, -1);
  const fim = fimDoMes(mes);
  const ctx = await contextoDo(id);
  const deChecks = ctx.inicioRastreamento && ctx.inicioRastreamento > mes ? ctx.inicioRastreamento : mes;
  const ateChecks = fim < hoje ? fim : hoje;
  const [areas, notas, raioxMes, metas, revisao, checks, tarefas, horas, candidaturas, focos] = await Promise.all([
    id.sb.from("raiox_areas").select("id, nome, ordem").order("ordem"),
    id.sb.from("raiox_notas").select("mes, area_id, importancia, acao, valor, compromisso, foco, meta_acao, como_medir").in("mes", [mes, anterior]),
    id.sb.from("raiox_meses").select("o_que_sai, checkin").eq("mes", mes).maybeSingle(),
    id.sb.from("metas").select("id, mes, titulo, tipo, alvo, progresso, unidade, habit_id, area_id, como_medir, concluida_em, origem").eq("mes", mes).order("ordem").order("criado_em"),
    id.sb.from("revisoes_mensais").select("nota, funcionou, nao_funcionou, aprendi, foco_proximo").eq("mes", mes).maybeSingle(),
    deChecks <= ateChecks ? carregarChecks(id.sb, deChecks, ateChecks) : Promise.resolve([]),
    id.sb.from("tarefas").select("id, concluida_em").gte("data", mes).lte("data", fim),
    id.sb.from("freela_time_logs").select("horas").gte("data_local", mes).lte("data_local", fim),
    id.sb.from("candidaturas").select("id").gte("data_envio", mes).lte("data_envio", fim),
    id.sb.from("focos").select("minutos").gte("data_local", mes).lte("data_local", fim),
  ]);
  for (const r of [areas, notas, raioxMes, metas, revisao, tarefas, horas, candidaturas, focos]) if (r.error) throw new Error(`mes: ${r.error.code ?? ""}`);

  const nomeArea = new Map((areas.data ?? []).map((a) => [a.id, a.nome]));
  const nomeHabito = new Map(ctx.habitos.map((h) => [h.id, h.nome]));
  const listaMetas: Meta[] = (metas.data ?? []).map((m) => ({
    id: m.id, mes: m.mes, titulo: m.titulo, tipo: m.tipo, alvo: m.alvo === null ? null : Number(m.alvo), progresso: Number(m.progresso),
    unidade: m.unidade, habitoId: m.habit_id, areaId: m.area_id, comoMedir: m.como_medir, concluidaEm: m.concluida_em, origem: m.origem,
  }));
  const notasDoMes = (notas.data ?? []).filter((n) => n.mes === mes);
  const notaAnterior = new Map((notas.data ?? []).filter((n) => n.mes === anterior).map((n) => [n.area_id, n]));
  const raiox = resumoRaiox(notasDoMes);
  const resumo = resumoDoMes(ctx, checks, mes, hoje);

  return {
    today: hoje,
    month: mes.slice(0, 7),
    goals: listaMetas.map((m) => {
      const p = progressoMeta(m, checks, hoje);
      return {
        id: m.id, title: m.titulo, type: m.tipo, unit: m.unidade, howToMeasure: m.comoMedir,
        target: p.alvo, current: p.atual, ratio: pct(p.pct), expectedByToday: p.esperado === null ? null : Math.round(p.esperado * 100) / 100,
        situation: p.situacao, completedAt: m.concluidaEm,
        habit: m.habitoId ? { id: m.habitoId, name: nomeHabito.get(m.habitoId) ?? null } : null,
        lifeArea: m.areaId ? nomeArea.get(m.areaId) ?? null : null,
        fromLifeReview: m.origem === "raiox",
      };
    }),
    lifeReview: {
      note: "Raio-X da vida: importância e ação de 1 a 10 por área; gap = importância − ação (positivo: falta atenção; negativo: energia demais).",
      areas: (areas.data ?? []).map((a) => {
        const n = notasDoMes.find((x) => x.area_id === a.id);
        const g = n ? gap(n) : null;
        const ant = notaAnterior.get(a.id);
        return {
          area: a.nome,
          importance: n?.importancia ?? null, action: n?.acao ?? null, gap: g, gapType: tipoGap(g), quadrant: n ? quadrante(n) : null,
          focus: n?.foco ?? false, value: n?.valor ?? null, commitment: n?.compromisso ?? null,
          actionTarget: n?.meta_acao ?? null, howToMeasure: n?.como_medir ?? null,
          previousMonth: ant ? { importance: ant.importancia, action: ant.acao, gap: gap(ant) } : null,
        };
      }),
      summary: { areasRated: raiox.avaliadas, averageGap: raiox.gapMedio === null ? null : Math.round(raiox.gapMedio * 100) / 100, needingAttention: raiox.emAtencao },
      whatLeavesTheAgenda: raioxMes.data?.o_que_sai ?? null,
      checkInDay: raioxMes.data?.checkin ?? null,
    },
    monthlyReview: {
      rating: revisao.data?.nota ?? null,
      whatWorked: revisao.data?.funcionou ?? null,
      whatDidntWork: revisao.data?.nao_funcionou ?? null,
      learned: revisao.data?.aprendi ?? null,
      nextFocus: revisao.data?.foco_proximo ?? null,
      numbers: {
        habitAdherence: pct(resumo.adesao), daysWithRecords: resumo.diasComRegistro,
        habits: resumo.porHabito.map((h) => ({ id: h.habitoId, name: nomeHabito.get(h.habitoId) ?? null, adherence: pct(h.adesao), daysDone: h.dias, bestStreak: h.melhorSequencia })),
        tasks: { total: tarefas.data?.length ?? 0, done: (tarefas.data ?? []).filter((t) => t.concluida_em).length },
        freelanceHours: Math.round((horas.data ?? []).reduce((s, h) => s + Number(h.horas), 0) * 100) / 100,
        applications: candidaturas.data?.length ?? 0,
        focusMinutes: (focos.data ?? []).reduce((s, f) => s + f.minutos, 0),
      },
    },
  };
}
