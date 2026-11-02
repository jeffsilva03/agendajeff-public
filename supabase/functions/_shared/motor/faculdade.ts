import type { Evento } from "./tipos.ts";

export type TipoAvaliacao = "prova" | "trabalho" | "atividade";

export const ROTULO_AVALIACAO: Record<TipoAvaliacao, string> = { prova: "Prova", trabalho: "Trabalho", atividade: "Atividade" };

/** Antecedência dos lembretes por tipo (dias antes), além do aviso no próprio dia. */
export const LEMBRETES_AVALIACAO: Record<TipoAvaliacao, number[]> = { prova: [3, 1], trabalho: [3, 1], atividade: [1] };

export interface AvaliacaoBase {
  id: string;
  tipo: TipoAvaliacao;
  titulo: string;
  data: string;
  hora: string | null;
  disciplina: string | null;
  entregue: boolean;
}

/** Avaliação pendente vira um prazo único na agenda e nos lembretes; entregue sai. */
export function avaliacaoParaEvento(a: AvaliacaoBase): Evento | null {
  if (a.entregue) return null;
  return {
    id: `avaliacao-${a.id}`, tipo: "prazo",
    titulo: `${ROTULO_AVALIACAO[a.tipo]}: ${a.titulo}${a.disciplina ? ` (${a.disciplina})` : ""}`,
    data: a.data, inicio: a.hora, fim: null, local: null, recorrencia: null, lembretesDias: [],
    lembretesAntes: LEMBRETES_AVALIACAO[a.tipo], lembretesAPartirDe: null, efeito: null, avaliacaoId: a.id,
  };
}
