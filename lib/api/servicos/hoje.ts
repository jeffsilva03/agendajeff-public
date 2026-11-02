// Visão de um dia, com a mesma lógica da tela Hoje (motor resolverDia, blocoDaVez, prazosDoHoje, carregarTarefas).
import { agoraSP, blocoDaVez, momentoDaCadeia, prazosDoHoje, resolverDia, type StatusCheck } from "@motor";
import { carregarTarefas } from "@/lib/dados";
import type { Identidade } from "../auth";
import { DIA_SEMANA, PERIODO, formatarAula, formatarCompromisso, formatarPrazo, statusHabito } from "../formatos";
import { contextoDo, formatarTarefa, ordemDeTarefa } from "./comum";

export async function visaoDoDia(id: Identidade, data: string, comNotas: boolean) {
  const agora = agoraSP();
  const ehHoje = data === agora.data;
  const hora = ehHoje ? agora.hora : null;
  const [ctx, checksDia, tarefas] = await Promise.all([
    contextoDo(id),
    id.sb.from("checks").select(comNotas ? "habit_id, status, nota" : "habit_id, status").eq("data_local", data),
    carregarTarefas(id.sb, data),
  ]);
  if (checksDia.error) throw new Error(`checks: ${checksDia.error.code ?? ""}`);
  const linhas = (checksDia.data ?? []) as unknown as { habit_id: string; status: StatusCheck; nota?: string | null }[];
  const status = new Map(linhas.map((c) => [c.habit_id, c.status]));
  const notas = new Map(linhas.filter((c) => c.nota).map((c) => [c.habit_id, c.nota as string]));
  const nome = new Map(ctx.habitos.map((h) => [h.id, h.nome]));
  const dia = resolverDia(data, ctx);

  const habito = (habitId: string) => ({
    habitId, name: nome.get(habitId) ?? null, status: statusHabito(status.get(habitId)),
    ...(comNotas && notas.has(habitId) ? { note: notas.get(habitId) } : {}),
  });
  const chains = dia.cadeias.map((c) => ({
    chainId: c.id,
    name: c.nome,
    period: PERIODO[c.periodo],
    window: c.janelaInicio && c.janelaFim ? { start: c.janelaInicio, end: c.janelaFim } : null,
    moment: hora && c.janelaInicio ? momentoDaCadeia(c, hora) : null,
    steps: c.passos.map((p) => ({
      ...habito(p.habitoId), position: p.posicao, trigger: p.gatilho, minimum: p.minimo, full: p.completo, notBefore: p.naoAntes,
    })),
  }));
  const flexible = dia.flexiveis.map((h) => habito(h.id));

  const todos = [...dia.cadeias.flatMap((c) => c.passos.map((p) => p.habitoId)), ...dia.flexiveis.map((h) => h.id)];
  const conta = (s: StatusCheck) => todos.filter((h) => status.get(h) === s).length;
  const vez = blocoDaVez(dia, (h) => status.get(h), hora);
  const proximoHabito = !vez ? null
    : vez.tipo === "cadeia" ? dia.cadeias.find((c) => c.id === vez.cadeiaId)!.passos.find((p) => !status.get(p.habitoId))!.habitoId
    : dia.flexiveis.find((h) => !status.get(h.id))!.id;

  const pendentes = tarefas.filter((t) => !t.concluidaEm).sort(ordemDeTarefa);
  const hoje = agora.data;
  const prazos = prazosDoHoje(ctx.eventos, dia, data);

  return {
    date: data,
    weekday: DIA_SEMANA[dia.diaSemana],
    isToday: ehHoje,
    localTime: hora,
    trackingStarted: ctx.inicioRastreamento ? data >= ctx.inicioRastreamento : null,
    classDay: { isClassDay: dia.diaDeAula, hasClass: dia.temAula, noClassReason: dia.motivoSemAula },
    classes: dia.aulas.map((a) => formatarAula(a, data)),
    events: dia.compromissos.map((e) => formatarCompromisso(e, data)),
    deadlinesToday: prazos.filter((p) => p.data === data).map((p) => formatarPrazo(p, data)),
    upcomingDeadlines: prazos.filter((p) => p.data !== data).map((p) => formatarPrazo(p, data)),
    conflicts: dia.avisos.map((a) => ({
      chainId: a.cadeiaId, chainName: dia.cadeias.find((c) => c.id === a.cadeiaId)?.nome ?? null,
      ...formatarCompromisso(dia.compromissos.find((e) => e.id === a.eventoId)!, data), message: a.texto,
    })),
    habits: {
      chains,
      flexible,
      current: vez && {
        type: vez.tipo === "cadeia" ? "chain" : "flexible",
        chainId: vez.tipo === "cadeia" ? vez.cadeiaId : null,
        moment: vez.tipo === "cadeia" && hora ? vez.momento : null,
        nextHabit: proximoHabito && habito(proximoHabito),
      },
      summary: {
        scheduled: todos.length,
        done: conta("completo") + conta("minimo"),
        doneFull: conta("completo"),
        doneMinimum: conta("minimo"),
        notDone: conta("nao_feito"),
        notApplicable: conta("nao_se_aplica"),
        pending: todos.filter((h) => !status.get(h)).length,
        note: "Mínimo conta como feito. \"Não se aplica\" não conta como falha.",
      },
    },
    tasks: {
      pending: pendentes.map((t) => formatarTarefa(t, hoje, comNotas)),
      overdue: pendentes.filter((t) => t.data < data && !t.recorrenteId).map((t) => formatarTarefa(t, hoje, comNotas)),
      done: tarefas.filter((t) => t.concluidaEm).map((t) => formatarTarefa(t, hoje, comNotas)),
    },
  };
}
