// Cálculos que as telas mostram e a API de integração também devolve. Ficam aqui para os dois
// usarem exatamente a mesma regra (sem cópia paralela na API).
import { minutos, somarDias } from "./datas.ts";
import { proximosPrazos } from "./prazos.ts";
import { diasComRegistro, historico, resumir, type DiaHabito, type ResumoHabito } from "./progresso.ts";
import type { Cadeia, Check, Contexto, DiaResolvido, Evento, OcorrenciaPrazo, StatusCheck } from "./tipos.ts";

/* ---------- Hoje: em que pé está cada cadeia ---------- */

/** A cadeia já passou da janela? (janela que cruza a meia-noite nunca "passa" no mesmo dia) */
export function jaPassou(c: Pick<Cadeia, "janelaInicio" | "janelaFim">, hora: string | null): boolean {
  if (!hora || !c.janelaInicio || !c.janelaFim) return false;
  if (minutos(c.janelaInicio) > minutos(c.janelaFim)) return false;
  return minutos(hora) >= minutos(c.janelaFim);
}

/** Ainda não chegou a hora da cadeia? */
export function antesDaJanela(c: Pick<Cadeia, "janelaInicio" | "janelaFim">, hora: string | null): boolean {
  if (!hora || !c.janelaInicio) return false;
  const cruza = !!c.janelaFim && minutos(c.janelaInicio) > minutos(c.janelaFim);
  return minutos(hora) < minutos(c.janelaInicio) && !(cruza && minutos(hora) < minutos(c.janelaFim!));
}

export type MomentoCadeia = "agora" | "a_seguir" | "passou";
export const momentoDaCadeia = (c: Pick<Cadeia, "janelaInicio" | "janelaFim">, hora: string | null): MomentoCadeia =>
  jaPassou(c, hora) ? "passou" : antesDaJanela(c, hora) ? "a_seguir" : "agora";

export type BlocoDaVez = { tipo: "cadeia"; cadeiaId: string; momento: MomentoCadeia } | { tipo: "flexiveis" } | null;

/**
 * O bloco que o Hoje põe em destaque: a primeira cadeia cuja janela não terminou e tem algo pendente;
 * depois os flexíveis; por fim a primeira cadeia que ficou para trás com pendência. Null: tudo registrado.
 */
export function blocoDaVez(dia: Pick<DiaResolvido, "cadeias" | "flexiveis">, status: (habitoId: string) => StatusCheck | null | undefined, hora: string | null): BlocoDaVez {
  const temPendente = (ids: string[]) => ids.some((id) => !status(id));
  const passos = (c: Cadeia) => c.passos.map((p) => p.habitoId);
  const aberta = dia.cadeias.find((c) => !jaPassou(c, hora) && temPendente(passos(c)));
  if (aberta) return { tipo: "cadeia", cadeiaId: aberta.id, momento: momentoDaCadeia(aberta, hora) };
  if (temPendente(dia.flexiveis.map((h) => h.id))) return { tipo: "flexiveis" };
  const atrasada = dia.cadeias.find((c) => temPendente(passos(c)));
  return atrasada ? { tipo: "cadeia", cadeiaId: atrasada.id, momento: "passou" } : null;
}

/**
 * Prazos que o Hoje lista: os do dia (sem repetir lembrete de um prazo que já aparece adiante)
 * mais os próximos prazos do horizonte, com os dias que faltam.
 */
export function prazosDoHoje(eventos: Evento[], dia: Pick<DiaResolvido, "prazos">, data: string, horizonteDias = 45): (OcorrenciaPrazo & { faltam: number })[] {
  const futuros = proximosPrazos(eventos, data, horizonteDias).filter((p) => p.data !== data);
  return [
    ...dia.prazos.filter((p) => !(p.tipo === "lembrete" && futuros.some((f) => f.eventoId === p.eventoId && f.data === p.dataPrazo))).map((p) => ({ ...p, faltam: 0 })),
    ...futuros,
  ];
}

/* ---------- Progresso dos hábitos (aba Progresso) ---------- */

export const META_DIAS = 66;

export interface ProgressoHabito {
  habitoId: string;
  nome: string;
  cadeias: string[]; // nomes das cadeias em que o hábito está
  flexivel: boolean;
  linha: DiaHabito[];
  resumo: ResumoHabito; // do início do acompanhamento até hoje
  resumo7: ResumoHabito; // últimos 7 dias
}

/** O que a aba Progresso calcula: linha do tempo, resumo geral e dos últimos 7 dias, por hábito. */
export function progressoHabitos(ctx: Contexto & { inicioRastreamento?: string | null }, checks: Check[], hoje: string) {
  const inicio = ctx.inicioRastreamento ?? hoje;
  const de = inicio < hoje ? inicio : hoje;
  const hist = historico(ctx, checks, de, hoje);
  const seteAtras = somarDias(hoje, -6);
  const habitos: ProgressoHabito[] = ctx.habitos.map((h) => {
    const linha = hist.get(h.id) ?? [];
    return {
      habitoId: h.id, nome: h.nome,
      cadeias: ctx.cadeias.filter((c) => c.passos.some((p) => p.habitoId === h.id)).map((c) => c.nome),
      flexivel: ctx.regrasFlex.some((r) => r.habitoIds.includes(h.id)),
      linha, resumo: resumir(linha, hoje), resumo7: resumir(linha.filter((d) => d.data >= seteAtras), hoje),
    };
  });
  const soma7 = habitos.reduce((a, l) => ({ feitos: a.feitos + l.resumo7.completos + l.resumo7.minimos, total: a.total + l.resumo7.diasQueValeram }), { feitos: 0, total: 0 });
  return {
    inicio,
    comecou: hoje >= inicio,
    diasComRegistro: diasComRegistro(checks),
    adesao7: { ...soma7, adesao: soma7.total ? soma7.feitos / soma7.total : null },
    maiorSequencia: [...habitos].sort((a, b) => b.resumo.sequenciaAtual - a.resumo.sequenciaAtual)[0] ?? null,
    maisPertoDaMeta: [...habitos].sort((a, b) => b.resumo.diasPraticados - a.resumo.diasPraticados)[0] ?? null,
    habitos,
  };
}

/* ---------- Freelas ---------- */

export type StatusFreela = "proposta" | "em_andamento" | "entregue" | "pago" | "cancelado";
export const STATUS_FREELA: Record<StatusFreela, string> = { proposta: "Proposta", em_andamento: "Em andamento", entregue: "Entregue", pago: "Pago", cancelado: "Cancelado" };

/** Horas por freela, horas do mês, a receber (entregues com valor) e recebido (pagos). */
export function resumoFreelas(freelas: { id: string; status: string; valor: number | string | null }[], registros: { freela_id: string; data_local: string; horas: number | string }[], hoje: string) {
  const mes = hoje.slice(0, 7);
  const horasPorFreela = new Map<string, number>();
  for (const r of registros) horasPorFreela.set(r.freela_id, (horasPorFreela.get(r.freela_id) ?? 0) + Number(r.horas));
  const soma = (status: string) => freelas.filter((f) => f.status === status && f.valor).reduce((s, f) => s + Number(f.valor), 0);
  return {
    horasPorFreela,
    horasMes: registros.filter((r) => r.data_local.startsWith(mes)).reduce((s, r) => s + Number(r.horas), 0),
    aReceber: soma("entregue"),
    recebido: soma("pago"),
  };
}

/* ---------- Faculdade ---------- */

/** Média simples das notas lançadas; null sem nenhuma nota. */
export const mediaNotas = (notas: number[]): number | null => (notas.length ? notas.reduce((t, n) => t + n, 0) / notas.length : null);

/** Semestre em andamento na data; sem nenhum, o mais recente da lista (ordenada do mais novo). */
export function semestreAtual<S extends { inicio: string; fim: string }>(semestres: S[], hoje: string): S | null {
  return semestres.find((s) => hoje >= s.inicio && hoje <= s.fim) ?? semestres[0] ?? null;
}
