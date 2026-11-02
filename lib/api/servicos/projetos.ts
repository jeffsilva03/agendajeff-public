// Projetos e features (mesmos cálculos da aba Projetos: progressoProjeto, ordenarProjetos e ordenarFeatures de lib/projetos).
import { agoraSP, diasEntre } from "@motor";
import {
  CATEGORIA_PROJETO, ordenarFeatures, ordenarProjetos, PRIORIDADE_FEATURE, PRIORIDADE_PROJETO, progressoProjeto, STATUS_FEATURE, STATUS_PROJETO,
  type Feature, type Projeto, type StatusProjeto,
} from "@/lib/projetos";
import type { Identidade } from "../auth";
import { ErroApi, paginar } from "../respostas";

const COLUNAS_FEATURE = "id, projeto_id, titulo, descricao, status, prioridade, ordem, concluida_em";
const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);

function formatarProjeto(p: Projeto, features: Feature[], hoje: string) {
  const prog = progressoProjeto(features);
  return {
    id: p.id, name: p.nome, summary: p.resumo,
    status: p.status, statusLabel: STATUS_PROJETO[p.status].rotulo, statusSince: p.status_desde,
    priority: p.prioridade, priorityLabel: PRIORIDADE_PROJETO[p.prioridade],
    category: p.categoria, categoryLabel: p.categoria ? CATEGORIA_PROJETO[p.categoria] : null,
    pinned: p.fixado, technologies: p.tecnologias,
    nextStep: p.proximo_passo,
    startDate: p.inicio, deadline: p.prazo,
    daysUntilDeadline: p.prazo && p.status !== "concluido" && p.status !== "arquivado" ? diasEntre(hoje, p.prazo) : null,
    repository: p.repositorio_url, website: p.site_url,
    progress: {
      done: prog.feitas, inProgress: prog.fazendo, total: prog.total, ratio: pct(prog.pct),
      mvpDone: prog.mvpFeitas, mvpTotal: prog.mvpTotal, mvpRatio: pct(prog.mvpPct),
    },
    createdAt: p.criado_em, updatedAt: p.atualizado_em,
  };
}

const formatarFeature = (f: Feature) => ({
  id: f.id, title: f.titulo, details: f.descricao,
  status: f.status, statusLabel: STATUS_FEATURE[f.status],
  priority: f.prioridade, priorityLabel: PRIORIDADE_FEATURE[f.prioridade].rotulo, mvp: f.prioridade === "essencial",
  completedAt: f.concluida_em,
});

export async function listarProjetos(id: Identidade, f: { status?: StatusProjeto[]; limit: number; offset: number }) {
  const hoje = agoraSP().data;
  const [projetos, features] = await Promise.all([
    id.sb.from("projetos").select("*"),
    id.sb.from("projeto_features").select(COLUNAS_FEATURE),
  ]);
  if (projetos.error || features.error) throw new Error(`projetos: ${(projetos.error ?? features.error)!.code ?? ""}`);
  const todos = ordenarProjetos((projetos.data ?? []) as Projeto[]);
  const todasFeatures = (features.data ?? []) as Feature[];
  const doProjeto = (pid: string) => todasFeatures.filter((x) => x.projeto_id === pid);
  // Como no filtro "Todos" da tela; arquivados só quando pedidos no status.
  const filtrados = todos.filter((p) => (f.status ? f.status.includes(p.status) : p.status !== "arquivado"));
  const { itens, pagination } = paginar(filtrados, f.limit, f.offset);
  return {
    data: {
      today: hoje,
      projects: itens.map((p) => formatarProjeto(p, doProjeto(p.id), hoje)),
      summary: {
        byStatus: Object.fromEntries(Object.keys(STATUS_PROJETO).map((s) => [s, todos.filter((p) => p.status === s).length])),
        note: "Arquivados ficam de fora, a não ser que sejam pedidos no status. Para descrição, features e anotações de um projeto, use o detalhe do projeto.",
      },
    },
    pagination,
  };
}

export async function detalheProjeto(id: Identidade, projetoId: string) {
  const hoje = agoraSP().data;
  const [projeto, features] = await Promise.all([
    id.sb.from("projetos").select("*").eq("id", projetoId).maybeSingle(),
    id.sb.from("projeto_features").select(COLUNAS_FEATURE).eq("projeto_id", projetoId),
  ]);
  if (projeto.error || features.error) throw new Error(`projeto: ${(projeto.error ?? features.error)!.code ?? ""}`);
  if (!projeto.data) throw new ErroApi("nao_encontrado");
  const p = projeto.data as Projeto;
  const lista = ordenarFeatures((features.data ?? []) as Feature[]);
  return {
    today: hoje,
    project: {
      ...formatarProjeto(p, lista, hoje),
      description: p.descricao, problem: p.problema, audience: p.publico, notes: p.notas,
      features: lista.map(formatarFeature),
    },
  };
}
