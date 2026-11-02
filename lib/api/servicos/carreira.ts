// Candidaturas e freelas (mesmos resumos das telas: resumoCandidaturas e resumoFreelas do motor).
import { agoraSP, diasEntre, resumoCandidaturas, resumoFreelas, STATUS_CANDIDATURA, STATUS_FREELA, type StatusCandidatura, type StatusFreela } from "@motor";
import type { Identidade } from "../auth";
import { numero } from "../formatos";
import { dataHoraSP, paginar } from "../respostas";

const ENCERRADA: StatusCandidatura[] = ["recusada", "desisti"];

interface LinhaCandidatura {
  id: string; empresa: string; vaga: string; link: string | null; origem: string | null; status: StatusCandidatura;
  data_envio: string; proxima_acao: string | null; proxima_data: string | null; proxima_hora: string | null; atualizado_em: string; notas?: string | null;
}

export async function listarCandidaturas(id: Identidade, f: { status?: StatusCandidatura[]; upcoming?: boolean; limit: number; offset: number }, comNotas: boolean) {
  const hoje = agoraSP().data;
  const colunas = `id, empresa, vaga, link, origem, status, data_envio, proxima_acao, proxima_data, proxima_hora, atualizado_em${comNotas ? ", notas" : ""}`;
  const { data, error } = await id.sb.from("candidaturas").select(colunas).order("data_envio", { ascending: false }).limit(1000);
  if (error) throw new Error(`candidaturas: ${error.code ?? ""}`);
  const todas = (data ?? []) as unknown as LinhaCandidatura[];
  const temEtapa = (c: LinhaCandidatura) => !!c.proxima_data && c.proxima_data >= hoje && !ENCERRADA.includes(c.status);
  const filtradas = todas
    .filter((c) => !f.status || f.status.includes(c.status))
    .filter((c) => f.upcoming === undefined || f.upcoming === temEtapa(c));
  const { itens, pagination } = paginar(filtradas, f.limit, f.offset);
  const resumo = resumoCandidaturas(todas.map((c) => ({ id: c.id, empresa: c.empresa, vaga: c.vaga, status: c.status, dataEnvio: c.data_envio, proximaAcao: c.proxima_acao, proximaData: c.proxima_data, proximaHora: c.proxima_hora })), hoje);
  const formatar = (c: LinhaCandidatura) => ({
    id: c.id, company: c.empresa, role: c.vaga, status: c.status, statusLabel: STATUS_CANDIDATURA[c.status],
    appliedOn: c.data_envio, daysSinceApplied: diasEntre(c.data_envio, hoje), source: c.origem, link: c.link,
    nextStep: c.proxima_data || c.proxima_acao ? {
      action: c.proxima_acao, date: c.proxima_data, time: c.proxima_hora?.slice(0, 5) ?? null,
      dateTime: c.proxima_data ? dataHoraSP(c.proxima_data, c.proxima_hora?.slice(0, 5) ?? null) : null,
    } : null,
    updatedAt: c.atualizado_em,
    ...(comNotas ? { notes: c.notas ?? null } : {}),
  });
  return {
    data: {
      today: hoje,
      applications: itens.map(formatar),
      summary: {
        total: resumo.total, byStatus: resumo.por, responded: resumo.respondidas,
        responseRate: resumo.taxaResposta === null ? null : Math.round(resumo.taxaResposta * 1000) / 1000,
        lastSevenDays: resumo.ultimos7Dias,
        awaitingResponse: resumo.por.enviada,
        note: "\"Aguardando resposta\" = status Enviada (ainda sem retorno registrado).",
      },
      upcomingSteps: todas.filter(temEtapa).sort((a, b) => (a.proxima_data! + (a.proxima_hora ?? "")).localeCompare(b.proxima_data! + (b.proxima_hora ?? ""))).map(formatar),
    },
    pagination,
  };
}

interface LinhaFreela {
  id: string; cliente: string; titulo: string; status: StatusFreela; prazo: string | null; valor: number | string | null;
  horas_estimadas: number | string | null; repositorio_url: string | null; portfolio_registrado: boolean; descricao?: string | null;
}

export async function listarFreelas(id: Identidade, f: { status?: StatusFreela[]; limit: number; offset: number }, comNotas: boolean) {
  const hoje = agoraSP().data;
  const colunas = `id, cliente, titulo, status, prazo, valor, horas_estimadas, repositorio_url, portfolio_registrado${comNotas ? ", descricao" : ""}`;
  const [freelas, registros] = await Promise.all([
    id.sb.from("freelas").select(colunas).order("criado_em"),
    id.sb.from("freela_time_logs").select("freela_id, data_local, horas"),
  ]);
  if (freelas.error || registros.error) throw new Error(`freelas: ${(freelas.error ?? registros.error)!.code ?? ""}`);
  const todos = (freelas.data ?? []) as unknown as LinhaFreela[];
  const r = resumoFreelas(todos, registros.data ?? [], hoje);
  // Como na tela: cancelados ficam de fora, a não ser que sejam pedidos.
  const filtrados = todos.filter((x) => (f.status ? f.status.includes(x.status) : x.status !== "cancelado"));
  const { itens, pagination } = paginar(filtrados, f.limit, f.offset);
  const formatar = (x: LinhaFreela) => ({
    id: x.id, project: x.titulo, client: x.cliente, status: x.status, statusLabel: STATUS_FREELA[x.status],
    deadline: x.prazo, daysUntilDeadline: x.prazo ? diasEntre(hoje, x.prazo) : null,
    value: numero(x.valor), currency: "BRL",
    estimatedHours: numero(x.horas_estimadas), loggedHours: Math.round((r.horasPorFreela.get(x.id) ?? 0) * 100) / 100,
    repository: x.repositorio_url, portfolioRegistered: x.portfolio_registrado,
    ...(comNotas ? { description: x.descricao ?? null } : {}),
  });
  return {
    data: {
      today: hoje,
      freelances: itens.map(formatar),
      summary: {
        byStatus: Object.fromEntries(Object.keys(STATUS_FREELA).map((s) => [s, todos.filter((x) => x.status === s).length])),
        hoursThisMonth: Math.round(r.horasMes * 100) / 100,
        toReceive: r.aReceber, received: r.recebido, currency: "BRL",
        note: "A receber = soma do valor dos freelas com status Entregue. Recebido = status Pago.",
      },
      upcomingDeliveries: todos.filter((x) => x.prazo && x.prazo >= hoje && (x.status === "proposta" || x.status === "em_andamento"))
        .sort((a, b) => a.prazo!.localeCompare(b.prazo!)).map(formatar),
    },
    pagination,
  };
}
