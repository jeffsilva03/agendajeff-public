// Carrega as tabelas e converte para as estruturas do motor.
// Usado pelo app (cliente com RLS, sem userId) e pelas Edge Functions (service role, com userId).
import { avaliacaoParaEvento, candidaturaParaEvento, classroomParaEvento, recorrenciaVale, type AulaHorario, type Recorrencia, type Cadeia, type Check, type Contexto, type Evento, type Periodo, type StatusCheck } from "./motor/index.ts";

// Tipagem mínima do cliente Supabase, para servir no Node e no Deno sem importar o pacote.
// deno-lint-ignore no-explicit-any
type Consulta = any;
export interface ClienteSupabase { from: (tabela: string) => Consulta }

const hm = (t: string | null) => (t ? t.slice(0, 5) : null);

export interface ContextoCompleto extends Contexto {
  inicioRastreamento: string | null;
}

/** Freela com prazo vira um prazo único, com lembrete na véspera. */
export const LEMBRETE_FREELA_DIAS_ANTES = [1];

/** Campos do perfil usados no contexto (a API de integração lê pela função api_perfil, sem tocar na tabela). */
export interface PerfilContexto { dias_de_aula: number[] | null; inicio_rastreamento: string | null }

export async function carregarContexto(sb: ClienteSupabase, userId?: string, perfilPronto?: PerfilContexto): Promise<ContextoCompleto> {
  const q = (tabela: string, colunas = "*") => {
    const c = sb.from(tabela).select(colunas);
    return userId ? c.eq("user_id", userId) : c;
  };
  const [perfil, habitos, cadeias, passos, flex, eventos, feriados, freelas, aulas, avaliacoes, candidaturas, turmasClassroom, atividadesClassroom] = await Promise.all([
    perfilPronto ? Promise.resolve({ data: perfilPronto, error: null }) : q("profiles", "dias_de_aula, inicio_rastreamento").maybeSingle(),
    q("habits", "id, nome, somente_domingo").eq("arquivado", false).order("criado_em"),
    q("chains").eq("ativo", true).order("ordem"),
    q("chain_steps").order("posicao"),
    q("daily_flex_rules", "contexto, habit_id, posicao").order("posicao"),
    q("events"),
    q("feriados", "data, nome, ativo"),
    q("freelas", "id, titulo, cliente, prazo, status").not("prazo", "is", null).in("status", ["proposta", "em_andamento"]),
    q("aulas", "id, dia_semana, inicio, fim, disciplinas(id, nome, cor, sala, professor, semestres(inicio, fim))"),
    q("avaliacoes", "id, tipo, titulo, data, hora, entregue, disciplinas(nome)").eq("entregue", false),
    q("candidaturas", "id, empresa, vaga, status, data_envio, proxima_acao, proxima_data, proxima_hora").not("proxima_data", "is", null),
    // Classroom: só turmas acompanhadas; as atividades que podem ter prazo na agenda (as entregues/devolvidas saem lá no motor).
    q("classroom_turmas", "course_id, nome, nome_exibicao, disciplinas(nome)").eq("acompanhar", true),
    q("classroom_atividades", "id, course_id, titulo, prazo_em, prazo_data, prazo_precisao, entrega_estado, entrega_atrasada, ausente_desde, avaliacao_id, resolucao_local"),
  ]);
  for (const r of [perfil, habitos, cadeias, passos, flex, eventos, feriados, freelas, aulas, avaliacoes, candidaturas, turmasClassroom, atividadesClassroom])
    if (r.error) throw new Error(`Falha ao carregar dados: ${r.error.message}`);

  // deno-lint-ignore no-explicit-any
  type L = any;
  const ativos = new Set((habitos.data ?? []).map((h: L) => h.id));
  const turmaPorCurso = new Map((turmasClassroom.data ?? []).map((t: L) => [t.course_id, t.nome_exibicao || t.disciplinas?.nome || t.nome]));
  const doClassroom = (atividadesClassroom.data ?? []).filter((a: L) => turmaPorCurso.has(a.course_id));
  // Avaliação manual vinculada a uma atividade do Classroom: a agenda mostra só a do Classroom (prazo e estado oficiais).
  const avaliacoesVinculadas = new Set(doClassroom.map((a: L) => a.avaliacao_id).filter(Boolean));
  return {
    diasDeAula: perfil.data?.dias_de_aula ?? [1, 2, 3, 4, 5],
    inicioRastreamento: perfil.data?.inicio_rastreamento ?? null,
    habitos: (habitos.data ?? []).map((h: L) => ({ id: h.id, nome: h.nome, somenteDomingo: h.somente_domingo })),
    cadeias: (cadeias.data ?? []).map((c: L): Cadeia => ({
      id: c.id, nome: c.nome, ancora: c.ancora, diasSemana: c.dias_semana, dependeAula: c.depende_aula,
      periodo: c.periodo as Periodo, janelaInicio: hm(c.janela_inicio), janelaFim: hm(c.janela_fim),
      naoAntes: hm(c.nao_antes), lembrete: c.lembrete, ordem: c.ordem,
      passos: (passos.data ?? [])
        .filter((p: L) => p.chain_id === c.id && ativos.has(p.habit_id))
        .map((p: L) => ({
          id: p.id, habitoId: p.habit_id, posicao: p.posicao, gatilho: p.gatilho,
          minimo: p.minimo, completo: p.completo, naoAntes: hm(p.nao_antes),
        })),
    })),
    regrasFlex: (["dia_util_sem_aula", "fim_de_semana"] as const).map((contexto) => ({
      contexto,
      habitoIds: (flex.data ?? []).filter((f: L) => f.contexto === contexto && ativos.has(f.habit_id)).map((f: L) => f.habit_id),
    })),
    eventos: [
      ...(eventos.data ?? []).map((e: L): Evento => ({
        id: e.id, tipo: e.tipo, titulo: e.titulo, data: e.data, inicio: hm(e.inicio), fim: hm(e.fim), local: e.local,
        recorrencia: e.recorrencia, lembretesDias: e.lembretes_dias ?? [], lembretesAntes: e.lembretes_antes ?? [],
        lembretesAPartirDe: e.lembretes_a_partir_de, efeito: e.efeito,
      })),
      ...(freelas.data ?? []).map((f: L): Evento => ({
        id: `freela-${f.id}`, tipo: "prazo", titulo: `Entrega: ${f.titulo} (${f.cliente})`, data: f.prazo,
        inicio: null, fim: null, local: null, recorrencia: null, lembretesDias: [],
        lembretesAntes: LEMBRETE_FREELA_DIAS_ANTES, lembretesAPartirDe: null, efeito: null, freelaId: f.id,
      })),
      ...(avaliacoes.data ?? []).filter((a: L) => !avaliacoesVinculadas.has(a.id)).map((a: L) => avaliacaoParaEvento({
        id: a.id, tipo: a.tipo, titulo: a.titulo, data: a.data, hora: hm(a.hora), disciplina: a.disciplinas?.nome ?? null, entregue: a.entregue,
      })).filter((e: Evento | null): e is Evento => !!e),
      ...doClassroom.map((a: L) => classroomParaEvento({
        id: a.id, titulo: a.titulo, disciplina: (turmaPorCurso.get(a.course_id) as string) ?? null,
        prazo: { precisao: a.prazo_precisao, em: a.prazo_em, data: a.prazo_data },
        entregaEstado: a.entrega_estado, entregaAtrasada: a.entrega_atrasada, ausente: !!a.ausente_desde, avaliacaoId: a.avaliacao_id, resolucaoLocal: a.resolucao_local,
      })).filter((e: Evento | null): e is Evento => !!e),
      ...(candidaturas.data ?? []).map((c: L) => candidaturaParaEvento({
        id: c.id, empresa: c.empresa, vaga: c.vaga, status: c.status, dataEnvio: c.data_envio,
        proximaAcao: c.proxima_acao, proximaData: c.proxima_data, proximaHora: hm(c.proxima_hora),
      })).filter((e: Evento | null): e is Evento => !!e),
    ],
    aulas: (aulas.data ?? []).filter((a: L) => a.disciplinas?.semestres).map((a: L): AulaHorario => ({
      id: a.id, disciplinaId: a.disciplinas.id, disciplina: a.disciplinas.nome, cor: a.disciplinas.cor,
      sala: a.disciplinas.sala, professor: a.disciplinas.professor, diaSemana: a.dia_semana,
      inicio: hm(a.inicio)!, fim: hm(a.fim)!, semestreInicio: a.disciplinas.semestres.inicio, semestreFim: a.disciplinas.semestres.fim,
    })),
    feriados: feriados.data ?? [],
  };
}

export async function carregarChecks(sb: ClienteSupabase, de: string, ate: string, userId?: string): Promise<Check[]> {
  let q = sb.from("checks").select("habit_id, data_local, status").gte("data_local", de).lte("data_local", ate);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw new Error(`Falha ao carregar checks: ${error.message}`);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((c: any) => ({ habitoId: c.habit_id, data: c.data_local, status: c.status as StatusCheck }));
}

export interface Tarefa {
  id: string;
  titulo: string;
  data: string;
  hora: string | null;
  notas: string | null;
  prioridade: number;
  concluidaEm: string | null;
  recorrenteId: string | null;
  /** Instância de recorrência ainda sem linha no banco (é criada ao concluir). */
  virtual?: boolean;
}

export function linhaParaRecorrencia(r: Record<string, unknown>): Recorrencia {
  return {
    id: r.id as string, titulo: r.titulo as string, regra: r.regra as Recorrencia["regra"], diasSemana: (r.dias_semana as number[]) ?? [],
    diaMes: (r.dia_mes as number | null) ?? null, hora: hm(r.hora as string | null), prioridade: r.prioridade as number,
    inicio: r.inicio as string, ativa: r.ativa as boolean,
  };
}

/**
 * Tarefas do dia, mais as atrasadas ainda abertas (elas "rolam" para hoje), mais as recorrentes
 * que valem no dia (virtuais até serem concluídas; recorrente não acumula atraso).
 */
export async function carregarTarefas(sb: ClienteSupabase, data: string, userId?: string): Promise<Tarefa[]> {
  let q = sb.from("tarefas").select("id, titulo, data, hora, notas, prioridade, concluida_em, recorrente_id")
    .or(`data.eq.${data},and(data.lt.${data},concluida_em.is.null,recorrente_id.is.null)`).order("data").order("hora", { nullsFirst: false });
  let qr = sb.from("tarefas_recorrentes").select("*").eq("ativa", true);
  if (userId) { q = q.eq("user_id", userId); qr = qr.eq("user_id", userId); }
  const [{ data: linhas, error }, { data: recs, error: erroRec }] = await Promise.all([q, qr]);
  if (error || erroRec) throw new Error(`Falha ao carregar tarefas: ${(error ?? erroRec).message}`);
  // deno-lint-ignore no-explicit-any
  const reais: Tarefa[] = (linhas ?? []).map((t: any) => ({ id: t.id, titulo: t.titulo, data: t.data, hora: hm(t.hora), notas: t.notas, prioridade: t.prioridade, concluidaEm: t.concluida_em, recorrenteId: t.recorrente_id }));
  const jaTem = new Set(reais.filter((t) => t.recorrenteId && t.data === data).map((t) => t.recorrenteId));
  const virtuais: Tarefa[] = (recs ?? []).map(linhaParaRecorrencia)
    .filter((r: Recorrencia) => recorrenciaVale(r, data) && !jaTem.has(r.id))
    .map((r: Recorrencia) => ({ id: `rec:${r.id}`, titulo: r.titulo, data, hora: r.hora, notas: null, prioridade: r.prioridade, concluidaEm: null, recorrenteId: r.id, virtual: true }));
  return [...reais, ...virtuais];
}
