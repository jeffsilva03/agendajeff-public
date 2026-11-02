// Tarefas com filtros, respeitando a regra do app: atrasada rola para o dia, recorrente não acumula.
import { agoraSP } from "@motor";
import { carregarTarefas, type Tarefa } from "@/lib/dados";
import type { Identidade } from "../auth";
import { ErroApi, paginar } from "../respostas";
import { validarIntervalo } from "../parametros";
import { formatarTarefa, ordemDeTarefa } from "./comum";
import { tarefasDoIntervalo } from "./agenda";

export interface FiltroTarefas {
  date?: string; start?: string; end?: string;
  status: "pending" | "done" | "all";
  overdue?: boolean; important?: boolean; recurring?: boolean;
  limit: number; offset: number;
}

/** Atrasadas: abertas com data anterior a hoje (recorrentes nunca ficam atrasadas). */
async function atrasadas(id: Identidade, hoje: string, comNotas: boolean): Promise<Tarefa[]> {
  const { data, error } = await id.sb.from("tarefas").select("id, titulo, data, hora, notas, prioridade, concluida_em, recorrente_id")
    .lt("data", hoje).is("concluida_em", null).is("recorrente_id", null).order("data").limit(500);
  if (error) throw new Error(`tarefas: ${error.code ?? ""}`);
  return (data ?? []).map((t) => ({
    id: t.id, titulo: t.titulo, data: t.data, hora: t.hora?.slice(0, 5) ?? null, notas: comNotas ? t.notas : null,
    prioridade: t.prioridade, concluidaEm: t.concluida_em, recorrenteId: t.recorrente_id,
  }));
}

export async function listarTarefas(id: Identidade, f: FiltroTarefas, comNotas: boolean) {
  const hoje = agoraSP().data;
  let base: Tarefa[];
  let escopo: { mode: string; date?: string; start?: string; end?: string };
  if (f.date && (f.start || f.end)) throw new ErroApi("parametro_invalido", [{ param: "date", message: "use date ou start/end, não os dois" }]);
  if (f.start || f.end) {
    if (!f.start || !f.end) throw new ErroApi("parametro_invalido", [{ param: f.start ? "end" : "start", message: "informe start e end juntos" }]);
    validarIntervalo(f.start, f.end);
    base = await tarefasDoIntervalo(id, f.start, f.end, comNotas);
    escopo = { mode: "range", start: f.start, end: f.end };
  } else if (f.overdue && !f.date) {
    base = await atrasadas(id, hoje, comNotas);
    escopo = { mode: "overdue" };
  } else {
    // Um dia, como no Hoje: as do dia, as atrasadas que rolam para ele e as recorrentes que valem nele.
    const data = f.date ?? hoje;
    base = await carregarTarefas(id.sb, data);
    if (!comNotas) base = base.map((t) => ({ ...t, notas: null }));
    escopo = { mode: "day", date: data };
  }
  const lista = base
    .filter((t) => f.status === "all" || (f.status === "done") === !!t.concluidaEm)
    .filter((t) => f.overdue === undefined || f.overdue === (!t.concluidaEm && t.data < hoje && !t.recorrenteId))
    .filter((t) => f.important === undefined || f.important === (t.prioridade === 1))
    .filter((t) => f.recurring === undefined || f.recurring === !!t.recorrenteId)
    .sort((a, b) => Number(!!a.concluidaEm) - Number(!!b.concluidaEm) || a.data.localeCompare(b.data) || ordemDeTarefa(a, b));
  const { itens, pagination } = paginar(lista, f.limit, f.offset);
  return {
    data: {
      scope: escopo,
      today: hoje,
      rules: "Tarefa não concluída passa para os dias seguintes como atrasada. Recorrente não acumula: cada dia da regra vale só naquele dia.",
      tasks: itens.map((t) => formatarTarefa(t, hoje, comNotas)),
      counts: {
        pending: lista.filter((t) => !t.concluidaEm).length,
        done: lista.filter((t) => t.concluidaEm).length,
        overdue: lista.filter((t) => !t.concluidaEm && t.data < hoje && !t.recorrenteId).length,
      },
    },
    pagination,
  };
}
