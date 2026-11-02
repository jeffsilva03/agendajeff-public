// Ferramentas MCP (somente leitura). Cada uma chama o mesmo serviço da API REST: nenhuma regra duplicada.
// As anotações do usuário vêm junto (ele liberou tudo para os aplicativos que autorizar).
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { consumirCota, exigirIntegracaoPermitida, type Identidade } from "@/lib/api/auth";
import { LIMITES, hojeSP, validarIntervalo, zData } from "@/lib/api/parametros";
import { ErroApi } from "@/lib/api/respostas";
import { agendaPorPeriodo, semanaConsolidada } from "@/lib/api/servicos/agenda";
import { buscar, CATEGORIAS } from "@/lib/api/servicos/busca";
import { listarCandidaturas, listarFreelas } from "@/lib/api/servicos/carreira";
import { dadosDaFaculdade } from "@/lib/api/servicos/faculdade";
import { dadosDosHabitos } from "@/lib/api/servicos/habitos";
import { visaoDoDia } from "@/lib/api/servicos/hoje";
import { dadosDeInsights } from "@/lib/api/servicos/insights";
import { dadosDoMes } from "@/lib/api/servicos/mes";
import { detalheProjeto, listarProjetos } from "@/lib/api/servicos/projetos";
import { listarTarefas } from "@/lib/api/servicos/tarefas";

const SOMENTE_LEITURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const data = zData.describe("Data no formato AAAA-MM-DD (fuso America/Sao_Paulo)");
const limite = (max: number, padrao: number) => z.number().int().min(1).max(max).default(padrao);
const deslocamento = (max: number) => z.number().int().min(0).max(max).default(0);

/** Identidade validada pelo verifyToken da rota (fica em authInfo.extra). */
function identidadeDo(ctx: { http?: { authInfo?: { extra?: Record<string, unknown> } } }): Identidade {
  const id = ctx.http?.authInfo?.extra?.identidade as Identidade | undefined;
  if (!id) throw new ErroApi("nao_autenticado");
  return id;
}

type Resultado = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

/** Executa com as mesmas proteções da API REST e devolve JSON estruturado (ou erro legível). */
async function executar(ctx: Parameters<typeof identidadeDo>[0], fn: (id: Identidade) => Promise<unknown>): Promise<Resultado> {
  try {
    const id = identidadeDo(ctx);
    exigirIntegracaoPermitida(id);
    await consumirCota(id);
    const r = await fn(id);
    const conteudo = (r && typeof r === "object" && "pagination" in r && "data" in r)
      ? { ...(r as { data: Record<string, unknown> }).data, pagination: (r as { pagination: unknown }).pagination }
      : (r as Record<string, unknown>);
    const estruturado = { ...conteudo, timezone: "America/Sao_Paulo", source: "AgendaJeff" };
    return { content: [{ type: "text", text: JSON.stringify(estruturado) }], structuredContent: estruturado };
  } catch (e) {
    const erro = e instanceof ErroApi ? e : new ErroApi("erro_interno");
    if (!(e instanceof ErroApi)) console.error(`[mcp] ${(e as Error)?.message ?? "erro"}`);
    const corpo = { error: { code: erro.codigo, message: erro.message, ...(erro.detalhes ? { details: erro.detalhes } : {}) } };
    return { content: [{ type: "text", text: JSON.stringify(corpo) }], structuredContent: corpo, isError: true };
  }
}

export function registrarFerramentas(server: McpServer) {
  server.registerTool("agenda_get_today", {
    title: "Resumo do dia",
    description: "Visão de um dia no AgendaJeff (padrão: hoje): aulas, compromissos, prazos, tarefas pendentes/atrasadas/concluídas, hábitos previstos com status, cadeia da vez, dia sem aula e colisões de horário.",
    inputSchema: z.object({ date: data.optional() }),
    annotations: SOMENTE_LEITURA,
  }, async ({ date }, ctx) => executar(ctx, (id) => visaoDoDia(id, date ?? hojeSP(), true)));

  server.registerTool("agenda_get_week", {
    title: "Semana consolidada",
    description: "Semana de segunda a domingo que contém a data (sem data: a semana do Planejar a semana, que no fim de semana é a próxima): aulas, compromissos, prazos, tarefas por dia, prioridades, foco da semana, colisões e revisão dos últimos 7 dias.",
    inputSchema: z.object({ date: data.optional() }),
    annotations: SOMENTE_LEITURA,
  }, async ({ date }, ctx) => executar(ctx, (id) => semanaConsolidada(id, date)));

  server.registerTool("agenda_list_events", {
    title: "Agenda por período",
    description: `Agenda dia a dia entre start e end (no máximo ${LIMITES.intervaloDias} dias): compromissos, aulas, prazos e lembretes (com a origem: evento, freela, faculdade, candidatura), dias sem aula, feriados e colisões.`,
    inputSchema: z.object({ start: data, end: data }),
    annotations: SOMENTE_LEITURA,
  }, async ({ start, end }, ctx) => executar(ctx, (id) => { validarIntervalo(start, end); return agendaPorPeriodo(id, start, end); }));

  server.registerTool("agenda_list_tasks", {
    title: "Tarefas",
    description: "Tarefas de um dia (padrão: hoje, incluindo as atrasadas que rolam para ele e as recorrentes do dia), de um intervalo (start e end) ou só as atrasadas (overdue=true sem data). Recorrente não acumula atraso.",
    inputSchema: z.object({
      date: data.optional(), start: data.optional(), end: data.optional(),
      status: z.enum(["pending", "done", "all"]).default("all"),
      overdue: z.boolean().optional(), important: z.boolean().optional(), recurring: z.boolean().optional(),
      limit: limite(LIMITES.pagina, 50), offset: deslocamento(LIMITES.offset),
    }),
    annotations: SOMENTE_LEITURA,
  }, async (args, ctx) => executar(ctx, (id) => listarTarefas(id, args, true)));

  server.registerTool("agenda_get_college_schedule", {
    title: "Grade da faculdade",
    description: "Semestre em andamento, disciplinas (professor, sala e número de faltas), grade semanal e as faltas registradas (data, disciplina, motivo). Com date, as aulas daquela data (respeita início/fim do semestre, feriados e dias sem aula, que também aparecem na agenda com o motivo).",
    inputSchema: z.object({ date: data.optional(), semester: z.enum(["current", "all"]).default("current") }),
    annotations: SOMENTE_LEITURA,
  }, async ({ date, semester }, ctx) => executar(ctx, async (id) => {
    const r = await dadosDaFaculdade(id, { date, semester, assessments: "pending", grades: false, notes: true });
    // Só a grade: as avaliações ficam na ferramenta de prazos (resposta menor, só o que foi perguntado).
    return { today: r.today, currentSemester: r.currentSemester, mostRecentSemester: r.mostRecentSemester, subjects: r.subjects, weeklySchedule: r.weeklySchedule, classesOnDate: r.classesOnDate, absences: r.absences };
  }));

  server.registerTool("agenda_list_college_deadlines", {
    title: "Provas, trabalhos e atividades",
    description: "Prazos da faculdade. assessments: provas, trabalhos e atividades cadastrados no AgendaJeff (data, disciplina, dias restantes, entrega). classroomAssignments: atividades sincronizadas do Google Classroom com o estado efetivo (pending = ainda pede ação: não entregue, atrasada ou não confirmada; delivered = entregue ou devolvida no Classroom; resolved_locally = o usuário concluiu no AgendaJeff ou dispensou; officialSituation traz o estado do Classroom). Padrão: pendentes. includeGrades=true traz notas lançadas e médias por disciplina.",
    inputSchema: z.object({
      status: z.enum(["pending", "delivered", "all"]).default("pending"),
      type: z.array(z.enum(["prova", "trabalho", "atividade"])).min(1).optional(),
      includeGrades: z.boolean().default(false),
    }),
    annotations: SOMENTE_LEITURA,
  }, async ({ status, type, includeGrades }, ctx) => executar(ctx, async (id) => {
    const r = await dadosDaFaculdade(id, { assessments: status, type, semester: "current", grades: includeGrades, notes: true });
    return { today: r.today, currentSemester: r.currentSemester, assessments: r.assessments, classroomAssignments: !type || type.includes("atividade") || type.includes("trabalho") ? r.classroomAssignments : [], ...(includeGrades ? { subjects: r.subjects.map((s) => ({ id: s.id, name: s.name, ...("average" in s ? { average: s.average, gradesCount: s.gradesCount } : {}) })) } : {}) };
  }));

  server.registerTool("agenda_get_habit_progress", {
    title: "Progresso dos hábitos",
    description: "Hábitos ativos com sequência atual e melhor, adesão geral e dos últimos 7 dias, rumo aos 66 dias. Com date, o estado de cada hábito naquele dia (ex.: o que ficou sem fazer ontem). Com start e end (até 92 dias), o histórico.",
    inputSchema: z.object({ date: data.optional(), start: data.optional(), end: data.optional(), habitId: z.uuid().optional() }),
    annotations: SOMENTE_LEITURA,
  }, async (args, ctx) => executar(ctx, (id) => dadosDosHabitos(id, args)));

  server.registerTool("agenda_list_applications", {
    title: "Candidaturas",
    description: "Candidaturas de emprego/estágio: empresa, vaga, status, data, próxima etapa (entrevista etc.) e resumo por status. upcoming=true filtra as que têm próxima etapa marcada.",
    inputSchema: z.object({
      status: z.array(z.enum(["enviada", "em_processo", "entrevista", "oferta", "recusada", "desisti"])).min(1).optional(),
      upcoming: z.boolean().optional(), limit: limite(LIMITES.pagina, 50), offset: deslocamento(LIMITES.offset),
    }),
    annotations: SOMENTE_LEITURA,
  }, async (args, ctx) => executar(ctx, (id) => listarCandidaturas(id, args, true)));

  server.registerTool("agenda_list_freelances", {
    title: "Freelas",
    description: "Projetos freela: cliente, status (proposta, em andamento, entregue, pago, cancelado), prazo, valor, horas previstas e registradas, horas do mês, valor a receber e próximas entregas. Cancelados só quando pedidos no status.",
    inputSchema: z.object({
      status: z.array(z.enum(["proposta", "em_andamento", "entregue", "pago", "cancelado"])).min(1).optional(),
      limit: limite(LIMITES.pagina, 50), offset: deslocamento(LIMITES.offset),
    }),
    annotations: SOMENTE_LEITURA,
  }, async (args, ctx) => executar(ctx, (id) => listarFreelas(id, args, true)));

  server.registerTool("agenda_get_insights", {
    title: "Insights",
    description: "Análises dos hábitos (adesão por hábito, por período e por dia da semana, onde a cadeia quebra, hábitos que andam juntos), revisão dos últimos 7 dias e tempo de foco. Análise sem dias suficientes vem como indisponível, com quantos dias faltam.",
    inputSchema: z.object({}),
    annotations: SOMENTE_LEITURA,
  }, async (ctx) => executar(ctx, (id) => dadosDeInsights(id)));

  server.registerTool("agenda_list_projects", {
    title: "Projetos",
    description: "Ideias e projetos pessoais para desenvolver: status (ideia, planejando, desenvolvendo, pausado, concluido, arquivado), prioridade, tipo, tecnologias, próximo passo, prazo e progresso das features (geral e do MVP = features essenciais). Arquivados só quando pedidos no status. Para descrição, features e anotações, use agenda_get_project.",
    inputSchema: z.object({
      status: z.array(z.enum(["ideia", "planejando", "desenvolvendo", "pausado", "concluido", "arquivado"])).min(1).optional(),
      limit: limite(LIMITES.pagina, 50), offset: deslocamento(LIMITES.offset),
    }),
    annotations: SOMENTE_LEITURA,
  }, async (args, ctx) => executar(ctx, (id) => listarProjetos(id, args)));

  server.registerTool("agenda_get_project", {
    title: "Detalhe de um projeto",
    description: "Um projeto completo pelo id (de agenda_list_projects ou agenda_search): descrição, problema que resolve, para quem, anotações, links, datas e todas as features com status (a_fazer, fazendo, feito) e prioridade (essencial = MVP, importante, extra).",
    inputSchema: z.object({ projectId: z.uuid() }),
    annotations: SOMENTE_LEITURA,
  }, async ({ projectId }, ctx) => executar(ctx, (id) => detalheProjeto(id, projectId)));

  server.registerTool("agenda_get_month", {
    title: "Mês: metas, Raio-X e revisão",
    description: "Um mês (padrão: o atual; month=AAAA-MM): metas do mês com progresso e situação (no caminho, atrás, concluída), Raio-X da vida (importância e ação por área, gaps, quadrante, valores, compromissos e foco, com o mês anterior) e revisão mensal (nota, o que funcionou, o que não, aprendizados, foco do próximo mês e os números: adesão aos hábitos, tarefas, horas de freela, candidaturas e minutos de foco).",
    inputSchema: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("Mês no formato AAAA-MM").optional() }),
    annotations: SOMENTE_LEITURA,
  }, async ({ month }, ctx) => executar(ctx, (id) => dadosDoMes(id, month)));

  server.registerTool("agenda_search", {
    title: "Buscar",
    description: "Busca por título/nome em tarefas, eventos, hábitos, faculdade (disciplinas, professores, avaliações), candidaturas, freelas e projetos (nome, resumo e features).",
    inputSchema: z.object({
      q: z.string().trim().min(2).max(60),
      categories: z.array(z.enum(["tasks", "events", "habits", "college", "applications", "freelances", "projects"])).min(1).optional(),
      limit: limite(LIMITES.busca, 20), offset: deslocamento(LIMITES.buscaOffset),
    }),
    annotations: SOMENTE_LEITURA,
  }, async ({ q, categories, limit, offset }, ctx) => executar(ctx, (id) => buscar(id, q, categories ?? CATEGORIAS, limit, offset)));
}
