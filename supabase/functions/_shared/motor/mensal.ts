// Mês: Raio-X da vida, metas do mês, resumo da revisão mensal e lembretes periódicos com frases.
// Funções puras, usadas pelas telas, pelo widget e pela Edge Function de lembretes.
import { diasEntre, hhmm, minutos, somarDias } from "./datas.ts";
import { frasesDoHorario } from "./frases.ts";
import { adesaoPorHabito } from "./insights.ts";
import { diasComRegistro } from "./progresso.ts";
import type { Check, Contexto } from "./tipos.ts";

/* ---------- Datas do mês ---------- */

/** Primeiro dia do mês de uma data: "2026-10-19" → "2026-10-01". */
export const inicioDoMes = (data: string) => `${data.slice(0, 7)}-01`;
/** Último dia do mês. */
export function fimDoMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${mes.slice(0, 8)}${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
export const somarMeses = (mes: string, n: number) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};
export const diasNoMes = (mes: string) => Number(fimDoMes(mes).slice(8));

/* ---------- Raio-X da vida ---------- */

/** As áreas sugeridas no primeiro Raio-X (dá para renomear, apagar e criar outras). */
export const AREAS_PADRAO = [
  "Família", "Relacionamento amoroso", "Amizades", "Trabalho e carreira", "Finanças",
  "Educação e aprendizado", "Lazer e hobbies", "Espiritualidade e sentido", "Cidadania e sociedade", "Autocuidado",
];

export interface NotaArea { areaId: string; nome: string; importancia: number | null; acao: number | null; metaAcao?: number | null; foco?: boolean }

/** Gap = importância − ação. Positivo: importa mais do que recebe; negativo: recebe energia demais. */
export const gap = (n: Pick<NotaArea, "importancia" | "acao">) => (n.importancia == null || n.acao == null ? null : n.importancia - n.acao);

export type TipoGap = "atencao" | "leve" | "equilibrio" | "excesso";
export function tipoGap(g: number | null): TipoGap | null {
  if (g === null) return null;
  return g >= 3 ? "atencao" : g >= 1 ? "leve" : g <= -2 ? "excesso" : "equilibrio";
}

export type Quadrante = "prioridade" | "em_dia" | "pode_esperar" | "energia_demais";
/** Mapa de prioridades: importância no eixo Y, ação no eixo X, corte no meio da escala (nota 6 ou mais é alta). */
export function quadrante(n: Pick<NotaArea, "importancia" | "acao">): Quadrante | null {
  if (n.importancia == null || n.acao == null) return null;
  const imp = n.importancia >= 6, ac = n.acao >= 6;
  return imp && !ac ? "prioridade" : imp && ac ? "em_dia" : !imp && ac ? "energia_demais" : "pode_esperar";
}

/** Áreas avaliadas, do maior gap para o menor (ou só as que já têm as duas notas). */
export const porGap = <T extends Pick<NotaArea, "importancia" | "acao">>(notas: T[]) =>
  notas.filter((n) => gap(n) !== null).sort((a, b) => gap(b)! - gap(a)!);

/**
 * Passo 2: as 3 áreas com maior gap positivo e, se houver, a que mais recebe energia demais (gap ≤ −2).
 */
export function areasParaPlano<T extends Pick<NotaArea, "importancia" | "acao">>(notas: T[]): T[] {
  const ordenadas = porGap(notas);
  const maiores = ordenadas.filter((n) => gap(n)! >= 1).slice(0, 3);
  const excesso = [...ordenadas].reverse().find((n) => gap(n)! <= -2);
  return excesso ? [...maiores, excesso] : maiores;
}

/** Resumo do Raio-X do mês: média de gap das áreas avaliadas (para comparar com o mês anterior). */
export function resumoRaiox(notas: Pick<NotaArea, "importancia" | "acao">[]) {
  const comNota = notas.filter((n) => gap(n) !== null);
  const gaps = comNota.map((n) => Math.abs(gap(n)!));
  return {
    avaliadas: comNota.length,
    gapMedio: gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null,
    emAtencao: comNota.filter((n) => tipoGap(gap(n)) === "atencao").length,
  };
}

/* ---------- Metas do mês ---------- */

export type TipoMeta = "contagem" | "habito" | "marco";
export interface Meta {
  id: string;
  mes: string;
  titulo: string;
  tipo: TipoMeta;
  alvo: number | null;
  progresso: number;
  unidade: string | null;
  habitoId: string | null;
  areaId: string | null;
  comoMedir: string | null;
  concluidaEm: string | null;
  origem: "manual" | "raiox";
}

export type SituacaoMeta = "concluida" | "no_caminho" | "atras" | "sem_alvo" | "encerrada";

export interface ProgressoMeta { atual: number; alvo: number | null; pct: number | null; esperado: number | null; situacao: SituacaoMeta }

/**
 * Progresso de uma meta no mês até `hoje`.
 * - contagem: o número registrado à mão;
 * - hábito: dias do mês com feito ou mínimo daquele hábito (dos registros);
 * - marco: 0 ou 1.
 * "No caminho" compara com o ritmo linear esperado para o dia do mês.
 */
export function progressoMeta(meta: Meta, checks: Check[], hoje: string): ProgressoMeta {
  const fim = fimDoMes(meta.mes);
  const atual = meta.tipo === "habito"
    ? new Set(checks.filter((c) => c.habitoId === meta.habitoId && c.data >= meta.mes && c.data <= fim && (c.status === "completo" || c.status === "minimo")).map((c) => c.data)).size
    : meta.tipo === "marco" ? (meta.concluidaEm ? 1 : 0) : Number(meta.progresso);
  const alvo = meta.tipo === "marco" ? 1 : meta.alvo != null ? Number(meta.alvo) : null;
  if (!alvo) return { atual, alvo: null, pct: null, esperado: null, situacao: meta.concluidaEm ? "concluida" : "sem_alvo" };
  const pct = Math.min(1, atual / alvo);
  const total = diasNoMes(meta.mes);
  const decorridos = hoje < meta.mes ? 0 : hoje > fim ? total : diasEntre(meta.mes, hoje) + 1;
  const esperado = meta.tipo === "marco" ? null : (alvo * decorridos) / total;
  const situacao: SituacaoMeta = atual >= alvo || (meta.tipo !== "habito" && meta.concluidaEm) ? "concluida"
    : hoje > fim ? "encerrada"
    : esperado === null ? "no_caminho"
    : atual + 1e-9 >= esperado * 0.9 ? "no_caminho" : "atras";
  return { atual, alvo, pct, esperado, situacao };
}

/* ---------- Revisão mensal ---------- */

/** Números do mês a partir dos registros, com o mesmo cálculo de adesão da página de Hábitos. */
export function resumoDoMes(ctx: Contexto & { inicioRastreamento?: string | null }, checks: Check[], mes: string, hoje: string) {
  const fim = fimDoMes(mes);
  const de = ctx.inicioRastreamento && ctx.inicioRastreamento > mes ? ctx.inicioRastreamento : mes;
  const ate = fim < hoje ? fim : hoje;
  if (ate < de) return { de, ate, comecou: false, diasComRegistro: 0, adesao: null, porHabito: [] as { habitoId: string; adesao: number | null; dias: number; melhorSequencia: number }[] };
  const doMes = checks.filter((c) => c.data >= de && c.data <= ate);
  const todos = adesaoPorHabito(ctx, doMes, de, ate).filter((h) => h.diasQueValeram > 0);
  const porHabito = todos.map((h) => ({ habitoId: h.habitoId, adesao: h.adesao, dias: h.completos + h.minimos, melhorSequencia: h.melhorSequencia }));
  const feitos = porHabito.reduce((s, h) => s + h.dias, 0);
  const valeram = todos.reduce((s, h) => s + h.diasQueValeram, 0);
  return { de, ate, comecou: true, diasComRegistro: diasComRegistro(doMes), adesao: valeram ? feitos / valeram : null, porHabito };
}

/* ---------- Lembretes periódicos ---------- */

/** Horários do lembrete periódico entre início e fim (inclusive), a cada `intervalo` minutos. */
export function horariosPeriodicos(inicio: string, fim: string, intervalo: number): string[] {
  const out: string[] = [];
  const a = minutos(inicio), b = minutos(fim);
  if (intervalo < 30 || b < a) return out;
  for (let m = a; m <= b; m += intervalo) out.push(hhmm(m));
  return out;
}

/** O horário periódico que acabou de vencer (até `janela` minutos atrás), ou null. */
export function horarioVencido(horarios: string[], agora: string, janela = 30): string | null {
  const m = minutos(agora);
  return horarios.find((h) => m - minutos(h) >= 0 && m - minutos(h) < janela) ?? null;
}

export interface ContextoFrase {
  hora: string;
  pendentes: number; // hábitos + tarefas que ainda faltam hoje
  sequencia?: { nome: string; dias: number } | null; // maior sequência atual
  proximoHabito?: string | null;
  compromissoDoMes?: { area: string; texto: string } | null; // do Raio-X (foco do mês)
  meta?: { titulo: string; falta: number; unidade: string | null } | null; // meta do mês mais atrasada
  proprias?: string[]; // frases cadastradas pelo usuário
}

/**
 * Frase do momento. Mistura frases personalizadas (sequência, próximo hábito, meta e compromisso do mês,
 * frases próprias) com o banco de frases do horário: a personalizada sai em cerca de 4 a cada 10 envios.
 * Determinística para o mesmo dia e horário (não repete o mesmo texto a cada envio).
 */
export function fraseDoMomento(c: ContextoFrase, semente: string): string {
  const pessoais: string[] = [];
  if (c.sequencia && c.sequencia.dias >= 2) pessoais.push(`${c.sequencia.dias} dias seguidos de ${c.sequencia.nome}. Não deixa a corrente quebrar hoje.`);
  if (c.proximoHabito) pessoais.push(`Próximo passo: ${c.proximoHabito}. Se o dia apertar, faz o mínimo.`);
  if (c.meta && c.meta.falta > 0) pessoais.push(`Meta do mês "${c.meta.titulo}": faltam ${formatarNumero(c.meta.falta)}${c.meta.unidade ? ` ${c.meta.unidade}` : ""}.`);
  if (c.compromissoDoMes) pessoais.push(`Seu compromisso do mês em ${c.compromissoDoMes.area}: ${c.compromissoDoMes.texto}`);
  if (c.pendentes === 1) pessoais.push("Falta só um item hoje. Fecha ele e o dia está ganho.");
  for (const p of c.proprias ?? []) pessoais.push(p);
  const h = hashTexto(semente);
  if (pessoais.length && h % 10 < 4) return pessoais[Math.floor(h / 10) % pessoais.length];
  const banco = frasesDoHorario(c.hora);
  return banco[Math.floor(h / 10) % banco.length];
}

const formatarNumero = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

function hashTexto(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Último dia do mês (para lembrar da revisão mensal). */
export const ehUltimoDiaDoMes = (data: string) => somarDias(data, 1).slice(8) === "01";
