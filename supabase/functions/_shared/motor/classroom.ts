// Google Classroom (via APIClassroom): estado de cada atividade e o prazo que ela leva para a agenda.
// Regras: PUBLISHED não é pendente; o estado vem da submissão própria; RETURNED não é "entregue de vez";
// sem estado é "não confirmado"; prazo só com data não ganha horário inventado.
// O estado efetivo (situacaoEfetiva) junta o oficial com a decisão pessoal feita no AgendaJeff
// ("concluída aqui" ou "dispensada"); é a única regra usada por painel, agenda, lembretes, .ics e API/MCP.
import { agoraSP } from "./datas.ts";
import type { Evento } from "./tipos.ts";

export type EstadoEntregaClassroom = "NEW" | "CREATED" | "TURNED_IN" | "RETURNED" | "RECLAIMED_BY_STUDENT";
export type PrecisaoPrazo = "instante" | "somente_data_utc" | "incompleto" | "sem_prazo";
/** Estado oficial (só a partir do Classroom). */
export type SituacaoClassroom = "pendente" | "atrasada" | "devolvida" | "entregue" | "nao_confirmada";
/** Decisão pessoal, guardada só no AgendaJeff. */
export type ResolucaoLocal = "concluida" | "dispensada";
/** Como a atividade aparece no AgendaJeff: o oficial, ou a decisão pessoal quando houver. */
export type SituacaoEfetiva = SituacaoClassroom | "concluida_local" | "dispensada";

export const ROTULO_SITUACAO_CLASSROOM: Record<SituacaoEfetiva, string> = {
  pendente: "Pendente", atrasada: "Atrasada", devolvida: "Devolvida", entregue: "Entregue no Classroom", nao_confirmada: "Status não confirmado",
  concluida_local: "Concluída no AgendaJeff", dispensada: "Dispensada",
};
/** Situações que ainda pedem ação (entram em pendências, agenda e lembretes quando têm prazo). */
export const SITUACOES_ABERTAS: SituacaoEfetiva[] = ["pendente", "atrasada", "nao_confirmada"];
export const ROTULO_ENTREGA_CLASSROOM: Record<EstadoEntregaClassroom, string> = {
  NEW: "Não entregue", CREATED: "Não entregue", RECLAIMED_BY_STUDENT: "Retomada (não entregue)", TURNED_IN: "Entregue", RETURNED: "Devolvida pelo professor",
};
/** Antecedência dos lembretes (dias antes, além do aviso no próprio dia): a mesma das atividades cadastradas à mão. */
export const LEMBRETES_CLASSROOM = [3, 1];

export interface PrazoClassroom { precisao: PrecisaoPrazo; em: string | null; data: string | null }

/** Data e hora locais (São Paulo) do prazo. Só com data: a data como veio, sem hora. */
export function prazoLocal(p: PrazoClassroom): { data: string; hora: string | null } | null {
  if (p.precisao === "instante" && p.em) {
    const { data, hora } = agoraSP(new Date(p.em));
    return { data, hora };
  }
  if (p.precisao === "somente_data_utc" && p.data) return { data: p.data, hora: null };
  return null;
}

/** O prazo já passou? Com horário, compara o instante; só com data, vence depois do dia. */
export function prazoPassou(p: PrazoClassroom, agora: Date = new Date()): boolean {
  if (p.precisao === "instante" && p.em) return new Date(p.em).getTime() < agora.getTime();
  if (p.precisao === "somente_data_utc" && p.data) return p.data < agoraSP(agora).data;
  return false;
}

export interface AtividadeClassroomBase {
  id: string;
  titulo: string;
  disciplina: string | null;
  prazo: PrazoClassroom;
  entregaEstado: EstadoEntregaClassroom | null;
  entregaAtrasada: boolean | null;
  ausente: boolean;
  /** Avaliação cadastrada à mão vinculada a esta atividade (a agenda mostra uma entrada só). */
  avaliacaoId?: string | null;
  /** Decisão pessoal no AgendaJeff (nunca enviada ao Classroom). */
  resolucaoLocal?: ResolucaoLocal | null;
}

export function situacaoClassroom(a: Pick<AtividadeClassroomBase, "prazo" | "entregaEstado" | "entregaAtrasada">, agora: Date = new Date()): SituacaoClassroom {
  switch (a.entregaEstado) {
    case "TURNED_IN": return "entregue";
    case "RETURNED": return "devolvida";
    case "NEW": case "CREATED": case "RECLAIMED_BY_STUDENT":
      return a.entregaAtrasada === true || prazoPassou(a.prazo, agora) ? "atrasada" : "pendente";
    default: return "nao_confirmada";
  }
}

/**
 * Estado efetivo. A entrega confirmada no Classroom prevalece (é fato oficial); fora isso, a decisão pessoal
 * ("concluída aqui" ou "dispensada") vale sobre o estado oficial, sem alterá-lo. Sem decisão, o oficial.
 */
export function situacaoEfetiva(a: Pick<AtividadeClassroomBase, "prazo" | "entregaEstado" | "entregaAtrasada" | "resolucaoLocal">, agora: Date = new Date()): SituacaoEfetiva {
  const oficial = situacaoClassroom(a, agora);
  if (oficial === "entregue") return "entregue";
  if (a.resolucaoLocal === "concluida") return "concluida_local";
  if (a.resolucaoLocal === "dispensada") return "dispensada";
  return oficial;
}

/**
 * Prazo na agenda (e nos lembretes) só para o que ainda pede ação: pendente, atrasada ou não confirmada
 * (pelo estado efetivo). Entregue, devolvida, concluída aqui e dispensada saem; sem prazo ou que sumiu do
 * Classroom não viram vencimento.
 */
export function classroomParaEvento(a: AtividadeClassroomBase, agora: Date = new Date()): Evento | null {
  const local = prazoLocal(a.prazo);
  if (!local || a.ausente) return null;
  const s = situacaoEfetiva(a, agora);
  if (!SITUACOES_ABERTAS.includes(s)) return null;
  return {
    id: `classroom-${a.id}`, tipo: "prazo",
    titulo: `Classroom: ${a.titulo}${a.disciplina ? ` (${a.disciplina})` : ""}${s === "nao_confirmada" ? ", entrega não confirmada" : ""}`,
    data: local.data, inicio: local.hora, fim: null, local: null, recorrencia: null, lembretesDias: [],
    lembretesAntes: LEMBRETES_CLASSROOM, lembretesAPartirDe: null, efeito: null, classroomId: a.id, avaliacaoId: a.avaliacaoId ?? null,
  };
}
