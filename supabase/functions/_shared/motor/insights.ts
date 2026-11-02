import { diaDaSemana, somarDias } from "./datas.ts";
import { resolverDia } from "./dia.ts";
import { historico, resumir } from "./progresso.ts";
import type { Check, Contexto, Periodo, StatusCheck } from "./tipos.ts";

/** Dias com registro necessários antes de mostrar cada análise. */
export const LIMIARES = { adesao: 7, quebra: 10, periodo: 14, diaSemana: 21, coocorrencia: 21 } as const;
export type Analise = keyof typeof LIMIARES;

export function estadoLimiar(analise: Analise, diasRegistrados: number) {
  const exige = LIMIARES[analise];
  return { exige, pronto: diasRegistrados >= exige, faltam: Math.max(0, exige - diasRegistrados) };
}

const feito = (s: StatusCheck | undefined) => s === "completo" || s === "minimo";

interface Ocorrencia { data: string; habitoId: string; periodo: Periodo; status: StatusCheck | undefined }

/**
 * Cada hábito que valia em cada dia, com o status registrado.
 * Dias sem nenhum registro ficam de fora (app não usado não é falha); hoje entra só com registro;
 * "não se aplica" sai da conta.
 */
function ocorrencias(ctx: Contexto, checks: Check[], de: string, hoje: string): Ocorrencia[] {
  const reg = new Map(checks.map((c) => [`${c.data}|${c.habitoId}`, c.status]));
  const comRegistro = new Set(checks.map((c) => c.data));
  const out: Ocorrencia[] = [];
  for (let d = de; d <= hoje; d = somarDias(d, 1)) {
    if (!comRegistro.has(d)) continue;
    const dia = resolverDia(d, ctx);
    const itens: [string, Periodo][] = [
      ...dia.cadeias.flatMap((c) => c.passos.map((p) => [p.habitoId, c.periodo] as [string, Periodo])),
      ...dia.flexiveis.map((h) => [h.id, "livre"] as [string, Periodo]),
    ];
    for (const [habitoId, periodo] of itens) {
      const status = reg.get(`${d}|${habitoId}`);
      if (status === "nao_se_aplica") continue;
      if (d === hoje && !status) continue;
      out.push({ data: d, habitoId, periodo, status });
    }
  }
  return out;
}

const taxa = (lista: Ocorrencia[]) => ({ feitos: lista.filter((o) => feito(o.status)).length, total: lista.length, adesao: lista.length ? lista.filter((o) => feito(o.status)).length / lista.length : null });

export function adesaoPorPeriodo(ctx: Contexto, checks: Check[], de: string, hoje: string) {
  const oc = ocorrencias(ctx, checks, de, hoje);
  return (["manha", "tarde", "noite", "livre"] as Periodo[]).map((p) => ({ periodo: p, ...taxa(oc.filter((o) => o.periodo === p)) }));
}

export function adesaoPorDiaSemana(ctx: Contexto, checks: Check[], de: string, hoje: string) {
  const oc = ocorrencias(ctx, checks, de, hoje);
  return [1, 2, 3, 4, 5, 6, 0].map((w) => ({ diaSemana: w, ...taxa(oc.filter((o) => diaDaSemana(o.data) === w)) }));
}

/**
 * Onde cada cadeia para: em cada dia em que a cadeia valia (até ontem, ou hoje se tudo registrado),
 * o primeiro passo não feito. Passos "não se aplica" são pulados.
 */
export function quebraDeCadeia(ctx: Contexto, checks: Check[], de: string, hoje: string) {
  const reg = new Map(checks.map((c) => [`${c.data}|${c.habitoId}`, c.status]));
  const comRegistro = new Set(checks.map((c) => c.data));
  return ctx.cadeias.map((c) => {
    const paradas = new Map<string, number>(c.passos.map((p) => [p.habitoId, 0]));
    let completas = 0, dias = 0;
    for (let d = de; d <= hoje; d = somarDias(d, 1)) {
      if (!comRegistro.has(d) || !resolverDia(d, ctx).cadeias.some((x) => x.id === c.id)) continue;
      const st = c.passos.map((p) => reg.get(`${d}|${p.habitoId}`));
      if (d === hoje && st.some((s) => !s)) continue;
      dias++;
      const i = c.passos.findIndex((p, k) => st[k] !== "nao_se_aplica" && !feito(st[k]));
      if (i < 0) completas++;
      else paradas.set(c.passos[i].habitoId, (paradas.get(c.passos[i].habitoId) ?? 0) + 1);
    }
    return { cadeiaId: c.id, dias, completas, paradas: c.passos.map((p) => ({ habitoId: p.habitoId, vezes: paradas.get(p.habitoId) ?? 0 })) };
  }).filter((q) => q.dias > 0);
}

/**
 * Hábitos que andam juntos: quanto fazer A aumenta a chance de fazer B no mesmo dia.
 * Só pares que valeram juntos em pelo menos `minDias` dias, com A feito e não feito ao menos 3 vezes cada.
 */
export function coocorrencia(ctx: Contexto, checks: Check[], de: string, hoje: string, minDias = 10) {
  const oc = ocorrencias(ctx, checks, de, hoje);
  const porDia = new Map<string, Map<string, boolean>>();
  for (const o of oc) {
    if (!porDia.has(o.data)) porDia.set(o.data, new Map());
    porDia.get(o.data)!.set(o.habitoId, feito(o.status));
  }
  const ids = ctx.habitos.map((h) => h.id);
  const pares = [];
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    let comA = 0, bComA = 0, semA = 0, bSemA = 0;
    for (const m of porDia.values()) {
      if (!m.has(a) || !m.has(b)) continue;
      if (m.get(a)) { comA++; if (m.get(b)) bComA++; } else { semA++; if (m.get(b)) bSemA++; }
    }
    if (comA + semA < minDias || comA < 3 || semA < 3) continue;
    const pComA = bComA / comA, pSemA = bSemA / semA;
    pares.push({ a, b, dias: comA + semA, pComA, pSemA, diferenca: pComA - pSemA });
  }
  return pares.filter((p) => p.diferenca >= 0.2).sort((x, y) => y.diferenca - x.diferenca).slice(0, 5);
}

export interface Revisao {
  de: string;
  ate: string;
  feitos: number;
  total: number;
  adesao: number | null;
  porHabito: { habitoId: string; feitos: number; total: number; adesao: number | null }[];
  sugestao: { tipo: "reduzir_minimo" | "definir_minimo" | "manter" | "focar" | "sem_dados"; habitoId: string | null; texto: string };
}

/** Revisão dos últimos 7 dias até `hoje`, com uma sugestão concreta. */
export function revisaoSemanal(ctx: Contexto, checks: Check[], hoje: string, minimos: Map<string, string | null>): Revisao {
  const de = somarDias(hoje, -6);
  const oc = ocorrencias(ctx, checks, de, hoje);
  const nome = new Map(ctx.habitos.map((h) => [h.id, h.nome]));
  const porHabito = ctx.habitos.map((h) => ({ habitoId: h.id, ...taxa(oc.filter((o) => o.habitoId === h.id)) })).filter((h) => h.total > 0);
  const geral = taxa(oc);
  let sugestao: Revisao["sugestao"];
  const pior = [...porHabito].filter((h) => h.total >= 3).sort((a, b) => (a.adesao ?? 1) - (b.adesao ?? 1))[0];
  if (!geral.total) {
    sugestao = { tipo: "sem_dados", habitoId: null, texto: "Ainda não há dias registrados nesta semana." };
  } else if (pior && (pior.adesao ?? 1) < 0.5) {
    const min = minimos.get(pior.habitoId);
    sugestao = min
      ? { tipo: "reduzir_minimo", habitoId: pior.habitoId, texto: `${nome.get(pior.habitoId)} saiu em ${pior.feitos} de ${pior.total} dias. Reduza a versão mínima (hoje: "${min}") para algo que caiba num dia ruim, por exemplo a metade.` }
      : { tipo: "definir_minimo", habitoId: pior.habitoId, texto: `${nome.get(pior.habitoId)} saiu em ${pior.feitos} de ${pior.total} dias e não tem versão mínima. Defina uma bem pequena: ela conta como feito.` };
  } else if ((geral.adesao ?? 0) >= 0.8) {
    sugestao = { tipo: "manter", habitoId: null, texto: "Semana forte. Mantenha a carga como está antes de acrescentar hábitos novos." };
  } else {
    sugestao = { tipo: "focar", habitoId: pior?.habitoId ?? null, texto: pior ? `Escolha ${nome.get(pior.habitoId)} como foco da próxima semana: é o que mais caiu (${pior.feitos} de ${pior.total}).` : "Mantenha o registro diário para a revisão ficar mais precisa." };
  }
  return { de, ate: hoje, ...geral, porHabito, sugestao };
}

/** Adesão por hábito desde `de` (usa o mesmo cálculo da página de Hábitos). */
export function adesaoPorHabito(ctx: Contexto, checks: Check[], de: string, hoje: string) {
  const hist = historico(ctx, checks, de, hoje);
  return ctx.habitos.map((h) => ({ habitoId: h.id, ...resumir(hist.get(h.id) ?? [], hoje) }));
}
