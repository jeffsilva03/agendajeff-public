// Faculdade: semestre, disciplinas, grade, aulas de uma data (respeitando semestre, feriado e dia sem aula),
// provas/trabalhos/atividades, faltas e, só quando pedidas, notas e médias.
import { agoraSP, diasEntre, mediaNotas, prazoLocal, resolverDia, ROTULO_AVALIACAO, ROTULO_SITUACAO_CLASSROOM, situacaoClassroom, situacaoEfetiva, SITUACOES_ABERTAS, type TipoAvaliacao } from "@motor";
import type { Identidade } from "../auth";
import { DIA_SEMANA, formatarAula, numero } from "../formatos";
import { dataHoraSP } from "../respostas";
import { contextoDo } from "./comum";

export interface FiltroFaculdade {
  date?: string;
  assessments: "pending" | "delivered" | "all";
  type?: TipoAvaliacao[];
  semester: "current" | "all";
  grades: boolean;
  notes: boolean;
}

interface Semestre { id: string; nome: string; inicio: string; fim: string }
interface Disciplina { id: string; semestre_id: string; nome: string; professor: string | null; sala: string | null; aulas: { dia_semana: number; inicio: string; fim: string }[] }
interface Avaliacao { id: string; disciplina_id: string | null; tipo: TipoAvaliacao; titulo: string; data: string; hora: string | null; entregue: boolean; nota?: number | string | null; descricao?: string | null }

export async function dadosDaFaculdade(id: Identidade, f: FiltroFaculdade) {
  const hoje = agoraSP().data;
  const colunasAvaliacao = ["id", "disciplina_id", "tipo", "titulo", "data", "hora", "entregue", ...(f.grades ? ["nota"] : []), ...(f.notes ? ["descricao"] : [])].join(", ");
  const [semestres, disciplinas, avaliacoes, faltas, turmasCl, atividadesCl] = await Promise.all([
    id.sb.from("semestres").select("id, nome, inicio, fim").order("inicio", { ascending: false }),
    id.sb.from("disciplinas").select("id, semestre_id, nome, professor, sala, aulas(dia_semana, inicio, fim)").order("nome"),
    id.sb.from("avaliacoes").select(colunasAvaliacao).order("data"),
    id.sb.from("faltas").select("data, disciplina_id, motivo, evento_id").order("data", { ascending: false }),
    id.sb.from("classroom_turmas").select("course_id, nome, nome_exibicao, disciplina_id").eq("acompanhar", true),
    id.sb.from("classroom_atividades").select("id, course_id, titulo, link, prazo_em, prazo_data, prazo_precisao, entrega_estado, entrega_atrasada, nota, pontuacao_maxima, ausente_desde, visto_em, resolucao_local, resolvida_em, revisar_desde").is("ausente_desde", null),
  ]);
  for (const r of [semestres, disciplinas, avaliacoes, faltas, turmasCl, atividadesCl]) if (r.error) throw new Error(`faculdade: ${r.error.code ?? ""}`);
  const listaSem = (semestres.data ?? []) as Semestre[];
  const listaDisc = (disciplinas.data ?? []) as unknown as Disciplina[];
  const listaAval = (avaliacoes.data ?? []) as unknown as Avaliacao[];

  // Semestre em andamento hoje. Se nenhum estiver em andamento, não finge que está: devolve null e o mais recente à parte.
  const emAndamento = listaSem.find((s) => hoje >= s.inicio && hoje <= s.fim) ?? null;
  const semestresVisiveis = f.semester === "all" ? listaSem : emAndamento ? [emAndamento] : [];
  const idsSem = new Set(semestresVisiveis.map((s) => s.id));
  const discVisiveis = listaDisc.filter((d) => idsSem.has(d.semestre_id));
  const nomeDisc = new Map(listaDisc.map((d) => [d.id, d.nome]));

  const avaliacoesFiltradas = listaAval
    .filter((a) => f.assessments === "all" || (f.assessments === "delivered") === a.entregue)
    .filter((a) => !f.type || f.type.includes(a.tipo))
    .filter((a) => f.semester === "all" || !a.disciplina_id || discVisiveis.some((d) => d.id === a.disciplina_id));

  let aulasNaData = null;
  if (f.date) {
    const ctx = await contextoDo(id);
    const dia = resolverDia(f.date, ctx);
    aulasNaData = { date: f.date, weekday: DIA_SEMANA[dia.diaSemana], hasClass: dia.temAula, noClassReason: dia.motivoSemAula, classes: dia.aulas.map((a) => formatarAula(a, f.date!)) };
  }

  // Google Classroom (turmas acompanhadas): estado efetivo (situacaoEfetiva, a mesma regra da agenda e do painel).
  // status: pending = ainda pede ação (pendente, atrasada, não confirmada); delivered = entregue ou devolvida no Classroom;
  // resolved_locally = concluída no AgendaJeff ou dispensada pelo usuário (nada disso é enviado ao Classroom).
  const turmaPorCurso = new Map((turmasCl.data ?? []).map((t) => [t.course_id, t]));
  const classroom = (atividadesCl.data ?? []).filter((a) => turmaPorCurso.has(a.course_id)).map((a) => {
    const t = turmaPorCurso.get(a.course_id)!;
    const prazo = { precisao: a.prazo_precisao, em: a.prazo_em, data: a.prazo_data };
    const oficial = situacaoClassroom({ prazo, entregaEstado: a.entrega_estado, entregaAtrasada: a.entrega_atrasada });
    const situacao = situacaoEfetiva({ prazo, entregaEstado: a.entrega_estado, entregaAtrasada: a.entrega_atrasada, resolucaoLocal: a.resolucao_local });
    const local = prazoLocal(prazo);
    return {
      id: a.id, source: "google_classroom", title: a.titulo,
      subject: t.nome_exibicao || (t.disciplina_id ? nomeDisc.get(t.disciplina_id) : null) || t.nome, subjectId: t.disciplina_id, classroomCourseId: a.course_id,
      status: SITUACOES_ABERTAS.includes(situacao) ? "pending" : situacao === "entregue" || situacao === "devolvida" ? "delivered" : "resolved_locally",
      situation: situacao, situationLabel: ROTULO_SITUACAO_CLASSROOM[situacao], officialSituation: oficial,
      localResolution: a.resolucao_local === "concluida" ? "completed" : a.resolucao_local === "dispensada" ? "dismissed" : null,
      localResolutionAt: a.resolvida_em, needsReview: !!(a.resolucao_local && a.revisar_desde),
      submissionState: a.entrega_estado, grade: a.nota === null ? null : Number(a.nota), maxPoints: a.pontuacao_maxima === null ? null : Number(a.pontuacao_maxima),
      date: local?.data ?? null, time: local?.hora ?? null, dateTime: local ? dataHoraSP(local.data, local.hora) : null,
      daysLeft: local ? diasEntre(hoje, local.data) : null, deadlinePrecision: a.prazo_precisao, link: a.link, lastSyncedAt: a.visto_em,
    };
  }).filter((c) => f.assessments === "all" || (f.assessments === "pending" ? c.status === "pending" : c.status !== "pending"))
    .sort((x, y) => (x.dateTime ?? x.date ?? "9999").localeCompare(y.dateTime ?? y.date ?? "9999"));

  return {
    today: hoje,
    currentSemester: emAndamento && { id: emAndamento.id, name: emAndamento.nome, start: emAndamento.inicio, end: emAndamento.fim },
    mostRecentSemester: !emAndamento && listaSem[0] ? { id: listaSem[0].id, name: listaSem[0].nome, start: listaSem[0].inicio, end: listaSem[0].fim, inProgress: false } : null,
    ...(f.semester === "all" ? { semesters: listaSem.map((s) => ({ id: s.id, name: s.nome, start: s.inicio, end: s.fim, inProgress: hoje >= s.inicio && hoje <= s.fim })) } : {}),
    subjects: discVisiveis.map((d) => {
      const notas = listaAval.filter((a) => a.disciplina_id === d.id && a.nota !== null && a.nota !== undefined).map((a) => Number(a.nota));
      return {
        id: d.id, name: d.nome, professor: d.professor, room: d.sala, semesterId: d.semestre_id,
        schedule: [...d.aulas].sort((a, b) => ((a.dia_semana + 6) % 7) - ((b.dia_semana + 6) % 7) || a.inicio.localeCompare(b.inicio))
          .map((a) => ({ weekday: DIA_SEMANA[a.dia_semana], startTime: a.inicio.slice(0, 5), endTime: a.fim.slice(0, 5) })),
        absences: (faltas.data ?? []).filter((x) => x.disciplina_id === d.id).length,
        ...(f.grades ? { average: mediaNotas(notas), gradesCount: notas.length, averageMethod: "média simples das notas lançadas" } : {}),
      };
    }),
    weeklySchedule: [1, 2, 3, 4, 5, 6, 0].map((w) => ({
      weekday: DIA_SEMANA[w],
      classes: discVisiveis.flatMap((d) => d.aulas.filter((a) => a.dia_semana === w).map((a) => ({
        subjectId: d.id, subject: d.nome, startTime: a.inicio.slice(0, 5), endTime: a.fim.slice(0, 5), room: d.sala, professor: d.professor,
      }))).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    })).filter((d) => d.classes.length),
    classesOnDate: aulasNaData,
    classroomAssignments: classroom,
    absences: (faltas.data ?? [])
      .filter((x) => f.semester === "all" || discVisiveis.some((d) => d.id === x.disciplina_id))
      .map((x) => ({ date: x.data, subjectId: x.disciplina_id, subject: nomeDisc.get(x.disciplina_id) ?? null, reason: x.motivo, missedWholeDay: !!x.evento_id })),
    assessments: avaliacoesFiltradas.map((a) => ({
      id: a.id, type: a.tipo, typeLabel: ROTULO_AVALIACAO[a.tipo], title: a.titulo,
      subjectId: a.disciplina_id, subject: a.disciplina_id ? nomeDisc.get(a.disciplina_id) ?? null : null,
      date: a.data, time: a.hora?.slice(0, 5) ?? null, dateTime: dataHoraSP(a.data, a.hora?.slice(0, 5) ?? null),
      daysLeft: diasEntre(hoje, a.data), status: a.entregue ? "delivered" : a.data < hoje ? "pending_past_due" : "pending",
      ...(f.grades ? { grade: numero(a.nota) } : {}),
      ...(f.notes ? { description: a.descricao ?? null } : {}),
    })),
  };
}
