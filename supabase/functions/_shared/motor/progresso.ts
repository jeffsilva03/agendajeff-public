import { somarDias } from "./datas.ts";
import { resolverDia } from "./dia.ts";
import type { Check, Contexto, StatusCheck } from "./tipos.ts";

/**
 * Estado de um hábito num dia:
 * - um status registrado;
 * - "pendente": valia, o dia teve outros registros, mas este hábito não foi marcado (conta como não feito);
 * - "sem_registro": valia, mas o dia não teve nenhum registro (app não usado): fica fora da adesão;
 * - "fora": não valia neste dia.
 */
export type EstadoDia = StatusCheck | "pendente" | "sem_registro" | "fora";

export interface DiaHabito { data: string; estado: EstadoDia }

/** Linha do tempo de cada hábito entre `de` e `ate`, usando a resolução real de cada dia. */
export function historico(ctx: Contexto, checks: Check[], de: string, ate: string): Map<string, DiaHabito[]> {
  const porDia = new Map<string, Map<string, StatusCheck>>();
  for (const c of checks) {
    if (!porDia.has(c.data)) porDia.set(c.data, new Map());
    porDia.get(c.data)!.set(c.habitoId, c.status);
  }
  const out = new Map<string, DiaHabito[]>(ctx.habitos.map((h) => [h.id, []]));
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    const dia = resolverDia(d, ctx);
    const valem = new Set([...dia.cadeias.flatMap((c) => c.passos.map((p) => p.habitoId)), ...dia.flexiveis.map((h) => h.id)]);
    const reg = porDia.get(d);
    for (const h of ctx.habitos) {
      const s = reg?.get(h.id);
      out.get(h.id)!.push({ data: d, estado: s ?? (!valem.has(h.id) ? "fora" : reg ? "pendente" : "sem_registro") });
    }
  }
  return out;
}

export interface ResumoHabito {
  diasQueValeram: number; // denominador da adesão
  completos: number;
  minimos: number;
  naoFeitos: number;
  adesao: number | null; // (completo + mínimo) / dias que valeram; null sem nenhum dia
  sequenciaAtual: number;
  melhorSequencia: number;
  diasPraticados: number; // rumo aos 66 dias (Lally et al., 2010)
}

const feito = (e: EstadoDia) => e === "completo" || e === "minimo";
/** Dias que não contam nem quebram sequência. */
const neutro = (e: EstadoDia) => e === "fora" || e === "nao_se_aplica";

/**
 * Resumo de um hábito. "Não se aplica", dias em que o hábito não valia e dias sem nenhum registro
 * ficam fora do denominador. Dia sem registro interrompe a sequência. Hoje pendente não conta contra.
 */
export function resumir(linha: DiaHabito[], hoje: string): ResumoHabito {
  const dias = linha.filter((d) => !(d.data === hoje && (d.estado === "pendente" || d.estado === "sem_registro")) && d.data <= hoje);
  const conta = (e: EstadoDia) => dias.filter((d) => d.estado === e).length;
  const completos = conta("completo"), minimos = conta("minimo");
  const naoFeitos = conta("nao_feito") + conta("pendente");
  const diasQueValeram = completos + minimos + naoFeitos;

  let melhor = 0, corrente = 0;
  for (const d of dias) {
    if (neutro(d.estado)) continue;
    // sem_registro zera a sequência (cai no "não feito" abaixo), mas não entra na adesão.
    corrente = feito(d.estado) ? corrente + 1 : 0;
    melhor = Math.max(melhor, corrente);
  }
  let atual = 0;
  for (let i = dias.length - 1; i >= 0; i--) {
    const e = dias[i].estado;
    if (neutro(e)) continue;
    if (!feito(e)) break;
    atual++;
  }

  return {
    diasQueValeram, completos, minimos, naoFeitos,
    adesao: diasQueValeram ? (completos + minimos) / diasQueValeram : null,
    sequenciaAtual: atual, melhorSequencia: melhor, diasPraticados: completos + minimos,
  };
}

/** Dias distintos com pelo menos um registro: base dos limiares de insights. */
export const diasComRegistro = (checks: Check[]) => new Set(checks.map((c) => c.data)).size;
