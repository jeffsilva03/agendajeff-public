// Converte dados_iniciais.json nas estruturas do motor. Usado pelo seed e pelos testes,
// para que os dois partam exatamente da mesma interpretação dos dados.
import type { Cadeia, Contexto, Evento, Periodo, RegraFlex } from "@motor";
import { FERIADOS_NACIONAIS } from "./feriados-nacionais";

interface PassoJson { habito: string; gatilho: string; minimo: string; nao_antes?: string }
interface CadeiaJson { cadeia: string; ancora: string; periodo?: string; dias?: number[]; lembrete?: boolean; passos: PassoJson[] }
interface AgendaJson {
  data?: string; titulo: string; tipo: Evento["tipo"]; efeito?: string; inicio?: string; fim?: string | null;
  local?: string; recorrencia?: string; lembretes_dias?: number[]; lembretes_a_partir_de?: string; status_outubro?: string;
}
export interface DadosIniciais {
  fuso: string;
  rotina_dia_util: { acordar: string; sai_para_faculdade: string; aula_inicio: string; aula_fim: string; chega_em_casa: [string, string] } & Record<string, unknown>;
  dias_de_aula: number[];
  semestre: { inicio: string; fim: string };
  lembretes: string[];
  habitos: { id: string; nome: string; somente_domingo?: boolean }[];
  proposta_cadeias: { dia_util: CadeiaJson[]; domingo: CadeiaJson[]; fim_de_semana: CadeiaJson[] };
  inicio_rastreamento: string;
  agenda: AgendaJson[];
  pendencias: string[];
  flexiveis: { dia_util_sem_aula: string[]; fim_de_semana: string[] };
}

export const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export interface DadosNormalizados extends Contexto {
  eventosExtras: Record<string, { descricao: string | null; observacao: string | null }>;
  lembretes: string[];
  inicioRastreamento: string;
  semestre: { inicio: string; fim: string };
  rotina: DadosIniciais["rotina_dia_util"];
  pendencias: string[];
}

export function normalizar(d: DadosIniciais): DadosNormalizados {
  const r = d.rotina_dia_util;
  // Janelas de colisão decididas em 09/10/2026 a partir da rotina.
  const janelas: Record<string, [string, string]> = {
    "Manhã": [r.acordar, "12:00"],
    "Tarde": ["12:00", r.sai_para_faculdade],
    "Trajeto de ida": [r.sai_para_faculdade, r.aula_inicio],
    "Trajeto de volta": [r.aula_fim, r.chega_em_casa[1]],
  };

  const montar = (c: CadeiaJson, ordem: number, diasSemana: number[], periodo: Periodo): Cadeia => {
    const id = slug(c.cadeia);
    const [ji, jf] = janelas[c.cadeia] ?? [null, null];
    return {
      id, nome: c.cadeia, ancora: c.ancora, diasSemana,
      dependeAula: c.cadeia.startsWith("Trajeto"),
      periodo, janelaInicio: ji, janelaFim: jf, naoAntes: null,
      lembrete: c.lembrete ?? true, ordem,
      passos: c.passos.map((p, i) => ({
        id: `${id}:${i + 1}`, habitoId: p.habito, posicao: i + 1, gatilho: p.gatilho,
        minimo: p.minimo ?? null, completo: null, naoAntes: p.nao_antes ?? null,
      })),
    };
  };

  const pc = d.proposta_cadeias;
  const cadeias: Cadeia[] = [
    ...pc.dia_util.map((c, i) => montar(c, i + 1, d.dias_de_aula, (c.periodo as Periodo) ?? "livre")),
    ...pc.domingo.map((c, i) => montar(c, 10 + i, [0], (c.periodo as Periodo) ?? "livre")),
    ...pc.fim_de_semana.map((c, i) =>
      montar(c, 20 + i, c.dias ?? [6, 0], c.cadeia.startsWith("Manhã") ? "manha" : "livre")),
  ];

  const regrasFlex: RegraFlex[] = [
    { contexto: "dia_util_sem_aula", habitoIds: d.flexiveis.dia_util_sem_aula },
    { contexto: "fim_de_semana", habitoIds: d.flexiveis.fim_de_semana },
  ];

  const eventosExtras: DadosNormalizados["eventosExtras"] = {};
  const eventos: Evento[] = d.agenda.map((a) => {
    const rec = a.recorrencia?.match(/mensal dia (\d+)/);
    const id = slug(`${a.data ?? "recorrente"}-${a.tipo}-${a.titulo}`);
    eventosExtras[id] = { descricao: a.efeito ?? null, observacao: a.status_outubro ? `Outubro: ${a.status_outubro}` : null };
    return {
      id, tipo: a.tipo, titulo: a.titulo, data: a.data ?? null,
      inicio: a.inicio ?? null, fim: a.fim ?? null, local: a.local ?? null,
      recorrencia: rec ? `mensal:${rec[1]}` : null,
      lembretesDias: a.lembretes_dias ?? [], lembretesAPartirDe: a.lembretes_a_partir_de ?? null,
      efeito: a.tipo === "excecao_rotina" ? { sem_aula: true } : null,
    };
  });

  return {
    habitos: d.habitos.map((h) => ({ id: h.id, nome: h.nome, somenteDomingo: !!h.somente_domingo })),
    cadeias, regrasFlex, eventos, eventosExtras,
    feriados: FERIADOS_NACIONAIS.map((f) => ({ ...f, ativo: true })),
    diasDeAula: d.dias_de_aula,
    lembretes: d.lembretes,
    inicioRastreamento: d.inicio_rastreamento,
    semestre: d.semestre,
    rotina: r,
    pendencias: d.pendencias,
  };
}
