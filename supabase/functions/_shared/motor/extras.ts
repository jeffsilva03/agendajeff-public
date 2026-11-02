import { diaDaSemana, diasEntre, somarDias } from "./datas.ts";
import type { Evento } from "./tipos.ts";

/* ---------- Semana ---------- */

export const segundaDaSemana = (data: string) => somarDias(data, -((diaDaSemana(data) + 6) % 7));

/** Semana a planejar: no fim de semana, a próxima; nos outros dias, a atual. */
export function semanaParaPlanejar(hoje: string): { de: string; ate: string } {
  const w = diaDaSemana(hoje);
  const de = w === 6 || w === 0 ? segundaDaSemana(somarDias(hoje, 7)) : segundaDaSemana(hoje);
  return { de, ate: somarDias(de, 6) };
}

/* ---------- Tarefas recorrentes ---------- */

export interface Recorrencia {
  id: string;
  titulo: string;
  regra: "diaria" | "semanal" | "mensal";
  diasSemana: number[];
  diaMes: number | null;
  hora: string | null;
  prioridade: number;
  inicio: string;
  ativa: boolean;
}

const ultimoDiaDoMes = (data: string) => {
  const [y, m] = data.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** A recorrência gera tarefa neste dia? Mensal no dia 31 cai no último dia dos meses mais curtos. */
export function recorrenciaVale(r: Recorrencia, data: string): boolean {
  if (!r.ativa || data < r.inicio) return false;
  if (r.regra === "diaria") return true;
  if (r.regra === "semanal") return r.diasSemana.includes(diaDaSemana(data));
  const dia = Number(data.slice(8));
  return r.diaMes !== null && dia === Math.min(r.diaMes, ultimoDiaDoMes(data));
}

export function descreverRecorrencia(r: Pick<Recorrencia, "regra" | "diasSemana" | "diaMes">): string {
  const N = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  if (r.regra === "diaria") return "todo dia";
  if (r.regra === "mensal") return `todo dia ${r.diaMes}`;
  const d = [...r.diasSemana].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (d.join(",") === "1,2,3,4,5") return "dias úteis";
  if (d.join(",") === "6,0") return "fins de semana";
  return d.map((w) => N[w]).join(", ");
}

/* ---------- Candidaturas ---------- */

export type StatusCandidatura = "enviada" | "em_processo" | "entrevista" | "oferta" | "recusada" | "desisti";
export const STATUS_CANDIDATURA: Record<StatusCandidatura, string> = {
  enviada: "Enviada", em_processo: "Em processo", entrevista: "Entrevista", oferta: "Oferta", recusada: "Recusada", desisti: "Desisti",
};
const ENCERRADA = new Set<StatusCandidatura>(["recusada", "desisti"]);

export interface CandidaturaBase {
  id: string;
  empresa: string;
  vaga: string;
  status: StatusCandidatura;
  dataEnvio: string;
  proximaAcao: string | null;
  proximaData: string | null;
  proximaHora: string | null;
}

/** Próxima etapa vira item da agenda: com horário, compromisso; sem horário, prazo com lembrete na véspera. */
export function candidaturaParaEvento(c: CandidaturaBase): Evento | null {
  if (!c.proximaData || ENCERRADA.has(c.status)) return null;
  const titulo = `${c.proximaAcao?.trim() || "Próxima etapa"}: ${c.empresa}`;
  const base = { id: `candidatura-${c.id}`, titulo, data: c.proximaData, fim: null, local: null, recorrencia: null, lembretesDias: [], lembretesAPartirDe: null, efeito: null };
  return c.proximaHora
    ? { ...base, tipo: "compromisso", inicio: c.proximaHora }
    : { ...base, tipo: "prazo", inicio: null, lembretesAntes: [1] };
}

export function resumoCandidaturas(lista: CandidaturaBase[], hoje: string) {
  const por = Object.fromEntries(Object.keys(STATUS_CANDIDATURA).map((s) => [s, 0])) as Record<StatusCandidatura, number>;
  for (const c of lista) por[c.status]++;
  const total = lista.length;
  const respondidas = total - por.enviada;
  const semana = lista.filter((c) => diasEntre(c.dataEnvio, hoje) >= 0 && diasEntre(c.dataEnvio, hoje) < 7).length;
  return { total, por, respondidas, taxaResposta: total ? respondidas / total : null, ultimos7Dias: semana };
}

/* ---------- Foco ---------- */

export interface SessaoFoco { data: string; minutos: number }

/** Minutos de foco por semana (segunda a domingo), das mais antigas para a atual. */
export function focoPorSemana(sessoes: SessaoFoco[], hoje: string, semanas = 8) {
  const atual = segundaDaSemana(hoje);
  return Array.from({ length: semanas }, (_, i) => {
    const de = somarDias(atual, -7 * (semanas - 1 - i));
    const ate = somarDias(de, 6);
    const doPeriodo = sessoes.filter((s) => s.data >= de && s.data <= ate);
    return { de, minutos: doPeriodo.reduce((t, s) => t + s.minutos, 0), sessoes: doPeriodo.length };
  });
}
