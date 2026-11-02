import { minutos } from "./datas.ts";
import type { Check, DiaResolvido, Habito, Periodo } from "./tipos.ts";

export type PeriodoSlot = "manha" | "tarde" | "noite";

/** Período de um horário de lembrete: antes de 12h manhã, antes de 18h tarde, depois noite. */
export function periodoDoSlot(hora: string): PeriodoSlot {
  const m = minutos(hora);
  return m < 12 * 60 ? "manha" : m < 18 * 60 ? "tarde" : "noite";
}

const NOME: Record<PeriodoSlot, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };

export interface Lembrete {
  titulo: string;
  corpo: string;
  periodo: PeriodoSlot;
  pendentes: number;
  url: string;
}

/**
 * Conteúdo do lembrete de um horário, ou null se não houver nada pendente.
 * - Cadeias entram no slot do seu período; cadeias "livre" e flexíveis entram em 13h e 23h (tarde e noite).
 * - Cadeias com lembrete = false nunca aparecem.
 * - Prazos e lembretes de prazo saem no slot da manhã.
 * - Qualquer check registrado (inclusive não feito / não se aplica) tira o item de pendente.
 */
export function conteudoLembrete(hora: string, dia: DiaResolvido, checks: Check[], habitos: Habito[], tarefasPendentes: string[] = []): Lembrete | null {
  const nome = new Map(habitos.map((h) => [h.id, h.nome]));
  const periodo = periodoDoSlot(hora);
  const marcados = new Set(checks.filter((c) => c.data === dia.data).map((c) => c.habitoId));
  const linhas: string[] = [];
  let pendentes = 0;

  const aceita = (p: Periodo) => p === periodo || (p === "livre" && periodo !== "manha");
  for (const c of dia.cadeias.filter((c) => c.lembrete && aceita(c.periodo))) {
    const abertos = c.passos.filter((p) => !marcados.has(p.habitoId));
    if (!abertos.length) continue;
    pendentes += abertos.length;
    linhas.push(`${c.nome}: ${abertos.length} de ${c.passos.length} passos pendentes, próximo é ${nome.get(abertos[0].habitoId) ?? abertos[0].habitoId}`);
  }

  if (periodo !== "manha") {
    const flex = dia.flexiveis.filter((h) => !marcados.has(h.id));
    if (flex.length) {
      pendentes += flex.length;
      linhas.push(`Flexíveis: ${flex.map((h) => h.nome).join(", ")}`);
    }
  }

  if (periodo === "manha") {
    for (const p of dia.prazos) {
      linhas.push(p.tipo === "prazo" ? `Prazo hoje: ${p.titulo}` : `Lembrete: ${p.titulo} (prazo ${p.dataPrazo.slice(8)}/${p.dataPrazo.slice(5, 7)})`);
    }
  }

  // Tarefas avulsas: no plano da manhã e no resumo da noite (o que ficou).
  if (tarefasPendentes.length && periodo !== "tarde") {
    pendentes += tarefasPendentes.length;
    const lista = tarefasPendentes.slice(0, 3).join(", ") + (tarefasPendentes.length > 3 ? ` e mais ${tarefasPendentes.length - 3}` : "");
    linhas.push(`${tarefasPendentes.length === 1 ? "Tarefa" : "Tarefas"}: ${lista}`);
  }

  if (!linhas.length) return null;
  return { titulo: NOME[periodo], corpo: linhas.join("\n"), periodo, pendentes, url: `/hoje#${periodo}` };
}
