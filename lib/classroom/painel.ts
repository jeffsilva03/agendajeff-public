// Regras do painel "Atividades Classroom": situação, indicadores, filtros e textos de prazo.
// Funções puras, usadas no navegador (testadas em tests/api/classroom.test.ts).
import { agoraSP, diasEntre, prazoLocal, situacaoEfetiva, type EstadoEntregaClassroom, type PrecisaoPrazo, type ResolucaoLocal, type SituacaoEfetiva } from "@motor";

export interface AtividadeClassroom {
  id: string; course_id: string; activity_id: string; titulo: string; descricao: string | null; descricao_truncada: boolean;
  tipo: string | null; link: string | null; anexos: { tipo: string; nome: string | null; link: string | null }[];
  pontuacao_maxima: number | null; prazo_em: string | null; prazo_data: string | null; prazo_precisao: PrecisaoPrazo;
  criado_origem: string | null; atualizado_origem: string | null;
  entrega_estado: EstadoEntregaClassroom | null; entrega_atrasada: boolean | null; nota: number | null;
  entrega_atualizada_origem: string | null; entrega_link: string | null;
  visto_em: string; ausente_desde: string | null; mudou_em: string | null; mudancas: string[]; prazo_anterior: { em: string | null; data: string | null; precisao: PrecisaoPrazo } | null;
  status_pessoal: "a_fazer" | "fazendo" | "pronto"; prioridade: number; notas_pessoais: string | null; inicio_planejado: string | null; avaliacao_id: string | null;
  resolucao_local: ResolucaoLocal | null; resolvida_em: string | null; revisar_desde: string | null;
}

export interface TurmaClassroom {
  id: string; course_id: string; nome: string; estado: string | null; aliases: string[]; link: string | null;
  acompanhar: boolean; nome_exibicao: string | null; disciplina_id: string | null; ultima_sync_ok_em: string | null; ultimo_erro: string | null;
}

export const ORDEM_SITUACAO: SituacaoEfetiva[] = ["atrasada", "pendente", "devolvida", "nao_confirmada", "entregue", "concluida_local", "dispensada"];
/** Já resolvidas (entram recolhidas em "Todas"). */
export const RESOLVIDAS: SituacaoEfetiva[] = ["entregue", "concluida_local", "dispensada"];

export const prazoDe = (a: Pick<AtividadeClassroom, "prazo_precisao" | "prazo_em" | "prazo_data">) => ({ precisao: a.prazo_precisao, em: a.prazo_em, data: a.prazo_data });
/** Estado efetivo (a mesma regra da agenda, dos lembretes e da API: situacaoEfetiva do motor). */
export const situacaoDe = (a: AtividadeClassroom, agora: Date = new Date()) =>
  situacaoEfetiva({ prazo: prazoDe(a), entregaEstado: a.entrega_estado, entregaAtrasada: a.entrega_atrasada, resolucaoLocal: a.resolucao_local }, agora);

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const hh = (h: string) => (h.endsWith(":00") ? `${Number(h.slice(0, 2))}h` : `${Number(h.slice(0, 2))}h${h.slice(3, 5)}`);

/** "qua, 21/10 às 23h59", "21/10 (sem horário)" ou "Sem prazo informado". */
export function textoPrazo(a: Pick<AtividadeClassroom, "prazo_precisao" | "prazo_em" | "prazo_data">): string {
  const l = prazoLocal(prazoDe(a));
  if (!l) return a.prazo_precisao === "incompleto" ? "Prazo incompleto no Classroom" : "Sem prazo informado";
  const w = DIAS[new Date(`${l.data}T12:00:00Z`).getUTCDay()];
  return l.hora ? `${w}, ${dm(l.data)} às ${hh(l.hora)}` : `${w}, ${dm(l.data)} (sem horário)`;
}

/** Dias até o prazo (negativo: já passou), na data de São Paulo. Null sem prazo. */
export function diasAtePrazo(a: AtividadeClassroom, agora: Date = new Date()): number | null {
  const l = prazoLocal(prazoDe(a));
  return l ? diasEntre(agoraSP(agora).data, l.data) : null;
}

/** Mudou nos últimos 7 dias (título, prazo, entrega, nota…), visto a partir da sincronização. */
export const mudouRecente = (a: AtividadeClassroom, agora: Date = new Date()) =>
  !!a.mudou_em && a.mudancas.length > 0 && agora.getTime() - Date.parse(a.mudou_em) < 7 * 86_400_000;

export interface Indicadores {
  pendentes: number; atrasadas: number; entregues: number; devolvidas: number; naoConfirmadas: number; proximas7: number;
  concluidasLocal: number; dispensadas: number; revisar: number;
}

/** Só das turmas acompanhadas e das atividades que ainda aparecem no Classroom. */
export function indicadores(lista: AtividadeClassroom[], agora: Date = new Date()): Indicadores {
  const r: Indicadores = { pendentes: 0, atrasadas: 0, entregues: 0, devolvidas: 0, naoConfirmadas: 0, proximas7: 0, concluidasLocal: 0, dispensadas: 0, revisar: 0 };
  for (const a of lista) {
    const s = situacaoDe(a, agora);
    if (s === "pendente") r.pendentes++;
    else if (s === "atrasada") r.atrasadas++;
    else if (s === "entregue") r.entregues++;
    else if (s === "devolvida") r.devolvidas++;
    else if (s === "concluida_local") r.concluidasLocal++;
    else if (s === "dispensada") r.dispensadas++;
    else r.naoConfirmadas++;
    if (a.resolucao_local && a.revisar_desde) r.revisar++;
    const d = diasAtePrazo(a, agora);
    if ((s === "pendente" || s === "nao_confirmada") && d !== null && d >= 0 && d <= 7) r.proximas7++;
  }
  return r;
}

export type FiltroRapido = "todas" | "para_entregar" | "vencidas" | "proximos7" | "entregues" | "devolvidas" | "nao_confirmadas" | "concluidas_local" | "dispensadas" | "revisar";
export const FILTROS_RAPIDOS: { id: FiltroRapido; rotulo: string }[] = [
  { id: "para_entregar", rotulo: "Para entregar" }, { id: "vencidas", rotulo: "Vencidas" }, { id: "proximos7", rotulo: "Próximos 7 dias" },
  { id: "devolvidas", rotulo: "Devolvidas" }, { id: "nao_confirmadas", rotulo: "Não confirmadas" }, { id: "entregues", rotulo: "Entregues no Classroom" },
  { id: "concluidas_local", rotulo: "Concluídas aqui" }, { id: "dispensadas", rotulo: "Dispensadas" }, { id: "todas", rotulo: "Todas" },
];

export interface Filtros { rapido: FiltroRapido; curso: string | "todos"; busca: string; prazo: "todos" | "com" | "sem"; de: string | null; ate: string | null }

export function filtrar(lista: AtividadeClassroom[], f: Filtros, agora: Date = new Date()): AtividadeClassroom[] {
  const termo = f.busca.trim().toLocaleLowerCase("pt-BR");
  return lista.filter((a) => {
    const s = situacaoDe(a, agora);
    const d = diasAtePrazo(a, agora);
    if (f.rapido === "para_entregar" && s !== "pendente" && s !== "atrasada") return false;
    if (f.rapido === "vencidas" && s !== "atrasada") return false;
    if (f.rapido === "proximos7" && !((s === "pendente" || s === "nao_confirmada") && d !== null && d >= 0 && d <= 7)) return false;
    if (f.rapido === "entregues" && s !== "entregue") return false;
    if (f.rapido === "devolvidas" && s !== "devolvida") return false;
    if (f.rapido === "nao_confirmadas" && s !== "nao_confirmada") return false;
    if (f.rapido === "concluidas_local" && s !== "concluida_local") return false;
    if (f.rapido === "dispensadas" && s !== "dispensada") return false;
    if (f.rapido === "revisar" && !(a.resolucao_local && a.revisar_desde)) return false;
    if (f.curso !== "todos" && a.course_id !== f.curso) return false;
    const temPrazo = !!prazoLocal(prazoDe(a));
    if (f.prazo === "com" && !temPrazo) return false;
    if (f.prazo === "sem" && temPrazo) return false;
    if (f.de || f.ate) {
      const l = prazoLocal(prazoDe(a));
      if (!l || (f.de && l.data < f.de) || (f.ate && l.data > f.ate)) return false;
    }
    if (termo && !a.titulo.toLocaleLowerCase("pt-BR").includes(termo)) return false;
    return true;
  });
}

/** Ordem de leitura: com prazo primeiro (o mais próximo antes), sem prazo depois, pelo mais recente. */
export function ordenar(lista: AtividadeClassroom[]): AtividadeClassroom[] {
  const chave = (a: AtividadeClassroom) => {
    const l = prazoLocal(prazoDe(a));
    return l ? `0${l.data}${l.hora ?? "99:99"}` : `1${9999999999999 - Date.parse(a.atualizado_origem ?? a.visto_em)}`;
  };
  return [...lista].sort((a, b) => chave(a).localeCompare(chave(b)));
}

/* ---------- Entregas da semana ---------- */

export type Urgencia = "atrasada" | "hoje" | "amanha" | "proxima";
export const ROTULO_URGENCIA: Record<Urgencia, string> = { atrasada: "Atrasadas", hoje: "Vence hoje", amanha: "Vence amanhã", proxima: "Nos próximos dias" };
export const JANELA_SEMANA = 7;

export interface AvaliacaoEntrega { id: string; disciplina_id: string | null; tipo: string; titulo: string; data: string; hora?: string | null; entregue: boolean }

export interface EntregaSemana {
  chave: string;
  origem: "classroom" | "faculdade";
  titulo: string;
  disciplinaCurso: string | null;      // course_id (Classroom) ou disciplina_id (cadastrada), para o nome
  data: string;
  hora: string | null;
  dias: number;                        // negativo: atrasada
  urgencia: Urgencia;
  naoConfirmada: boolean;              // Classroom sem estado da entrega
  atividade?: AtividadeClassroom;
  avaliacaoId?: string;
}

/**
 * O que precisa ser entregue: atrasadas e o que vence nos próximos 7 dias (hoje incluído), pelo estado efetivo
 * (resolvidas e entregues ficam de fora). Junta as atividades do Classroom das turmas acompanhadas com os trabalhos
 * e atividades cadastrados na Faculdade (provas não são entrega). Avaliação vinculada a uma atividade do Classroom
 * aparece uma vez só, pela do Classroom.
 */
export function entregasDaSemana(atividades: AtividadeClassroom[], avaliacoes: AvaliacaoEntrega[], agora: Date = new Date()): EntregaSemana[] {
  const hoje = agoraSP(agora).data;
  const urgencia = (dias: number): Urgencia => (dias < 0 ? "atrasada" : dias === 0 ? "hoje" : dias === 1 ? "amanha" : "proxima");
  const lista: EntregaSemana[] = [];
  for (const a of atividades) {
    const s = situacaoDe(a, agora);
    if (s !== "pendente" && s !== "atrasada" && s !== "nao_confirmada") continue;
    const l = prazoLocal(prazoDe(a));
    if (!l) continue;
    const dias = diasEntre(hoje, l.data);
    if (dias >= JANELA_SEMANA && s !== "atrasada") continue;
    // Não confirmada com prazo passado: não afirmamos atraso, mas também não some da lista.
    lista.push({ chave: `c-${a.id}`, origem: "classroom", titulo: a.titulo, disciplinaCurso: a.course_id, data: l.data, hora: l.hora, dias, urgencia: s === "atrasada" ? "atrasada" : urgencia(dias), naoConfirmada: s === "nao_confirmada", atividade: a });
  }
  const vinculadas = new Set(atividades.map((a) => a.avaliacao_id).filter(Boolean));
  for (const v of avaliacoes) {
    if (v.entregue || v.tipo === "prova" || vinculadas.has(v.id)) continue;
    const dias = diasEntre(hoje, v.data);
    if (dias >= JANELA_SEMANA) continue;
    lista.push({ chave: `f-${v.id}`, origem: "faculdade", titulo: v.titulo, disciplinaCurso: v.disciplina_id, data: v.data, hora: v.hora ? v.hora.slice(0, 5) : null, dias, urgencia: urgencia(dias), naoConfirmada: false, avaliacaoId: v.id });
  }
  const peso: Record<Urgencia, number> = { atrasada: 0, hoje: 1, amanha: 2, proxima: 3 };
  return lista.sort((x, y) => peso[x.urgencia] - peso[y.urgencia] || `${x.data}${x.hora ?? "99:99"}`.localeCompare(`${y.data}${y.hora ?? "99:99"}`) || x.titulo.localeCompare(y.titulo, "pt-BR"));
}
