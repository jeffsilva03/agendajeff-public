// Conversão das estruturas do motor para o contrato público da API (chaves em inglês, valores estáveis).
import { diasEntre, type AulaHorario, type EstadoDia, type Evento, type OcorrenciaPrazo, type Periodo, type StatusCheck } from "@motor";
import { dataHoraSP } from "./respostas";

export const STATUS_HABITO: Record<StatusCheck, string> = { completo: "done", minimo: "minimum", nao_feito: "not_done", nao_se_aplica: "not_applicable" };
export const statusHabito = (s: StatusCheck | null | undefined) => (s ? STATUS_HABITO[s] : "pending");

/** Estado de um hábito num dia do histórico (inclui os estados derivados do motor). */
export const ESTADO_DIA: Record<EstadoDia, string> = {
  ...STATUS_HABITO,
  pendente: "not_marked", // valia, o dia teve registros, mas este hábito não foi marcado (conta como não feito)
  sem_registro: "no_records", // valia, mas o dia não teve nenhum registro (fica fora da adesão)
  fora: "not_scheduled",
} as Record<EstadoDia, string>;

export const PERIODO: Record<Periodo, string> = { manha: "morning", tarde: "afternoon", noite: "evening", livre: "anytime" };
export const DIA_SEMANA = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** De onde veio um item da agenda (o motor junta tudo em eventos; o prefixo do id diz a origem). */
export function origemDoEvento(id: string): { source: "event" | "freelance" | "college" | "application" | "google_classroom"; sourceId: string } {
  for (const [prefixo, source] of [["freela-", "freelance"], ["avaliacao-", "college"], ["candidatura-", "application"], ["classroom-", "google_classroom"]] as const)
    if (id.startsWith(prefixo)) return { source, sourceId: id.slice(prefixo.length) };
  return { source: "event", sourceId: id };
}

export const formatarCompromisso = (e: Evento, data: string) => ({
  ...origemDoEvento(e.id),
  title: e.titulo,
  date: data,
  startTime: e.inicio,
  endTime: e.fim,
  start: dataHoraSP(data, e.inicio),
  end: dataHoraSP(data, e.fim),
  location: e.local,
});

export const formatarAula = (a: AulaHorario, data: string | null) => ({
  subjectId: a.disciplinaId,
  subject: a.disciplina,
  weekday: DIA_SEMANA[a.diaSemana],
  startTime: a.inicio,
  endTime: a.fim,
  ...(data ? { date: data, start: dataHoraSP(data, a.inicio), end: dataHoraSP(data, a.fim) } : {}),
  room: a.sala,
  professor: a.professor,
});

export const formatarPrazo = (p: OcorrenciaPrazo, hoje: string) => ({
  ...origemDoEvento(p.eventoId),
  title: p.titulo.replace(/^Prazo: /, ""),
  kind: p.tipo === "prazo" ? "deadline" : "reminder",
  date: p.data,
  dueDate: p.dataPrazo,
  daysUntilDue: diasEntre(hoje, p.dataPrazo),
});

export const numero = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
