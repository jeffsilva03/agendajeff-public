// Agenda por período e semana consolidada (mesma resolução de dia da tela Agenda e do Planejar a semana).
import { agoraSP, recorrenciaVale, resolverDia, revisaoSemanal, segundaDaSemana, semanaParaPlanejar, somarDias, type Contexto, type Recorrencia } from "@motor";
import { carregarChecks, linhaParaRecorrencia, type Tarefa } from "@/lib/dados";
import type { Identidade } from "../auth";
import { DIA_SEMANA, formatarAula, formatarCompromisso, formatarPrazo } from "../formatos";
import { contextoDo, formatarTarefa, ordemDeTarefa } from "./comum";

/** Um dia da agenda: aulas, compromissos, prazos/lembretes, dia sem aula, feriado e colisões. */
function diaDaAgenda(ctx: Contexto, data: string, hoje: string) {
  const dia = resolverDia(data, ctx);
  const feriado = ctx.feriados.find((f) => f.ativo && f.data === data);
  return {
    date: data,
    weekday: DIA_SEMANA[dia.diaSemana],
    classDay: { isClassDay: dia.diaDeAula, hasClass: dia.temAula, noClassReason: dia.motivoSemAula },
    holiday: feriado ? feriado.nome : null,
    classes: dia.aulas.map((a) => formatarAula(a, data)),
    events: dia.compromissos.map((e) => formatarCompromisso(e, data)),
    deadlines: dia.prazos.map((p) => formatarPrazo(p, hoje)),
    conflicts: dia.avisos.map((a) => ({ chainId: a.cadeiaId, eventId: a.eventoId, message: a.texto })),
  };
}

export async function agendaPorPeriodo(id: Identidade, inicio: string, fim: string) {
  const ctx = await contextoDo(id);
  const hoje = agoraSP().data;
  const dias = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(diaDaAgenda(ctx, d, hoje));
  return {
    start: inicio,
    end: fim,
    days: dias,
    totals: {
      classes: dias.reduce((t, d) => t + d.classes.length, 0),
      events: dias.reduce((t, d) => t + d.events.length, 0),
      deadlines: dias.reduce((t, d) => t + d.deadlines.filter((p) => p.kind === "deadline").length, 0),
      noClassDays: dias.filter((d) => d.classDay.isClassDay && !d.classDay.hasClass).length,
      conflicts: dias.reduce((t, d) => t + d.conflicts.length, 0),
    },
  };
}

/**
 * Tarefas de um intervalo: as linhas do banco mais as recorrentes que valem em cada dia (só de hoje em
 * diante: recorrente não acumula, então um dia que passou sem concluir não vira pendência).
 */
export async function tarefasDoIntervalo(id: Identidade, inicio: string, fim: string, comNotas = false): Promise<Tarefa[]> {
  const hoje = agoraSP().data;
  const [linhas, recs] = await Promise.all([
    id.sb.from("tarefas").select("id, titulo, data, hora, notas, prioridade, concluida_em, recorrente_id").gte("data", inicio).lte("data", fim).order("data"),
    id.sb.from("tarefas_recorrentes").select("*").eq("ativa", true),
  ]);
  if (linhas.error || recs.error) throw new Error(`tarefas: ${(linhas.error ?? recs.error)!.code ?? ""}`);
  const reais: Tarefa[] = (linhas.data ?? []).map((t) => ({
    id: t.id, titulo: t.titulo, data: t.data, hora: t.hora?.slice(0, 5) ?? null, notas: comNotas ? t.notas : null,
    prioridade: t.prioridade, concluidaEm: t.concluida_em, recorrenteId: t.recorrente_id,
  }));
  const feitas = new Set(reais.filter((t) => t.recorrenteId).map((t) => `${t.recorrenteId}|${t.data}`));
  const virtuais: Tarefa[] = [];
  for (const r of (recs.data ?? []).map(linhaParaRecorrencia) as Recorrencia[])
    for (let d = inicio > hoje ? inicio : hoje; d <= fim; d = somarDias(d, 1))
      if (recorrenciaVale(r, d) && !feitas.has(`${r.id}|${d}`))
        virtuais.push({ id: `rec:${r.id}:${d}`, titulo: r.titulo, data: d, hora: r.hora, notas: null, prioridade: r.prioridade, concluidaEm: null, recorrenteId: r.id, virtual: true });
  return [...reais, ...virtuais].sort((a, b) => a.data.localeCompare(b.data) || ordemDeTarefa(a, b));
}

/** Semana consolidada. Sem data: a mesma semana do Planejar a semana (no fim de semana, a próxima). */
export async function semanaConsolidada(id: Identidade, data?: string) {
  const hoje = agoraSP().data;
  const de = data ? segundaDaSemana(data) : semanaParaPlanejar(hoje).de;
  const ate = somarDias(de, 6);
  const [ctx, checks, tarefas] = await Promise.all([
    contextoDo(id),
    carregarChecks(id.sb, somarDias(hoje, -6), hoje),
    tarefasDoIntervalo(id, de, ate),
  ]);
  const nome = new Map(ctx.habitos.map((h) => [h.id, h.nome]));
  const minimos = new Map(ctx.cadeias.flatMap((c) => c.passos.map((p) => [p.habitoId, p.minimo] as [string, string | null])));
  const foco = id.perfil.foco_semana === de && id.perfil.foco_habito_id ? id.perfil.foco_habito_id : null;
  const revisao = revisaoSemanal(ctx, checks, hoje, minimos);
  const dias = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    const doDia = tarefas.filter((t) => t.data === d);
    dias.push({ ...diaDaAgenda(ctx, d, hoje), tasks: doDia.map((t) => formatarTarefa(t, hoje, false)) });
  }
  return {
    weekStart: de,
    weekEnd: ate,
    defaultedToPlanningWeek: !data,
    focusHabit: foco ? { habitId: foco, name: nome.get(foco) ?? null } : null,
    days: dias,
    priorities: tarefas.filter((t) => !t.concluidaEm && t.prioridade === 1).map((t) => formatarTarefa(t, hoje, false)),
    pending: {
      tasks: tarefas.filter((t) => !t.concluidaEm).length,
      deadlines: dias.flatMap((d) => d.deadlines.filter((p) => p.kind === "deadline")),
    },
    conflicts: dias.flatMap((d) => d.conflicts.map((c) => ({ date: d.date, ...c }))),
    lastSevenDaysReview: {
      start: revisao.de,
      end: revisao.ate,
      done: revisao.feitos,
      total: revisao.total,
      adherence: revisao.adesao,
      suggestion: { type: revisao.sugestao.tipo, habitId: revisao.sugestao.habitoId, text: revisao.sugestao.texto },
    },
  };
}
