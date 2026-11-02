// Peças compartilhadas pelos serviços: contexto do motor e tarefas no formato público.
import { carregarContexto, type Tarefa } from "@/lib/dados";
import type { Identidade } from "../auth";
import { dataHoraSP } from "../respostas";

/** Contexto do motor para o usuário autenticado (perfil vem de api_perfil, já carregado na autenticação). */
export const contextoDo = (id: Identidade) =>
  carregarContexto(id.sb, undefined, { dias_de_aula: id.perfil.dias_de_aula, inicio_rastreamento: id.perfil.inicio_rastreamento });

/** Ordem do Hoje: importantes primeiro, depois por horário (sem horário por último). */
export const ordemDeTarefa = (a: Tarefa, b: Tarefa) => b.prioridade - a.prioridade || (a.hora ?? "99").localeCompare(b.hora ?? "99");

export function formatarTarefa(t: Tarefa, hoje: string, comNotas: boolean) {
  const feita = !!t.concluidaEm;
  const atrasada = !feita && t.data < hoje && !t.recorrenteId;
  return {
    // Instância de tarefa recorrente que ainda não foi concluída não tem linha no banco: id nulo.
    id: t.virtual ? null : t.id,
    recurringTaskId: t.recorrenteId,
    title: t.titulo,
    date: t.data,
    time: t.hora,
    dateTime: dataHoraSP(t.data, t.hora),
    important: t.prioridade === 1,
    recurring: !!t.recorrenteId,
    status: feita ? "done" : "pending",
    completedAt: t.concluidaEm,
    overdue: atrasada,
    overdueSince: atrasada ? t.data : null,
    ...(comNotas ? { notes: t.notas } : {}),
  };
}
