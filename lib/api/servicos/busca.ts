// Busca determinística nos registros do usuário (RLS aplicada), nos campos de título/nome. O termo é escapado e usado num filtro ilike por coluna (sem SQL do cliente).
import { agoraSP } from "@motor";
import type { Identidade } from "../auth";
import { ErroApi, paginar } from "../respostas";

export type CategoriaBusca = "tasks" | "events" | "habits" | "college" | "applications" | "freelances" | "projects";
export const CATEGORIAS: CategoriaBusca[] = ["tasks", "events", "habits", "college", "applications", "freelances", "projects"];

interface Resultado { category: CategoriaBusca; type: string; id: string; title: string; subtitle: string | null; date: string | null }

/**
 * Escapa os curingas do LIKE (%, _ e \) para o termo ser literal. O PostgREST também trata "*" como
 * curinga e não há como escapá-lo na URL, então ele sai do termo.
 */
export const escaparLike = (q: string) => q.replace(/\*/g, "").replace(/[\\%_]/g, (c) => `\\${c}`);

export async function buscar(id: Identidade, q: string, categorias: CategoriaBusca[], limit: number, offset: number) {
  if (q.replace(/\*/g, "").trim().length < 2) throw new ErroApi("parametro_invalido", [{ param: "q", message: "mínimo de 2 caracteres além de *" }]);
  const padrao = `%${escaparLike(q)}%`;
  const teto = Math.min(limit + offset, 550);
  const consulta = async <T,>(tabela: string, colunas: string, coluna: string) => {
    const { data, error } = await id.sb.from(tabela).select(colunas).ilike(coluna, padrao).limit(teto);
    if (error) throw new Error(`busca ${tabela}: ${error.code ?? ""}`);
    return (data ?? []) as unknown as T[];
  };
  const tarefas: Promise<Resultado[]>[] = [];
  const quer = (c: CategoriaBusca) => categorias.includes(c);

  if (quer("tasks")) tarefas.push(consulta<{ id: string; titulo: string; data: string; concluida_em: string | null }>("tarefas", "id, titulo, data, concluida_em", "titulo")
    .then((l) => l.map((t) => ({ category: "tasks" as const, type: "task", id: t.id, title: t.titulo, subtitle: t.concluida_em ? "concluída" : "pendente", date: t.data }))));
  if (quer("events")) tarefas.push(consulta<{ id: string; titulo: string; data: string | null; tipo: string }>("events", "id, titulo, data, tipo", "titulo")
    .then((l) => l.map((e) => ({ category: "events" as const, type: e.tipo === "prazo" ? "deadline" : e.tipo === "excecao_rotina" ? "no_class_day" : "appointment", id: e.id, title: e.titulo, subtitle: null, date: e.data }))));
  if (quer("habits")) tarefas.push(consulta<{ id: string; nome: string }>("habits", "id, nome", "nome")
    .then((l) => l.map((h) => ({ category: "habits" as const, type: "habit", id: h.id, title: h.nome, subtitle: null, date: null }))));
  if (quer("college")) {
    tarefas.push(consulta<{ id: string; nome: string; professor: string | null }>("disciplinas", "id, nome, professor", "nome")
      .then((l) => l.map((d) => ({ category: "college" as const, type: "subject", id: d.id, title: d.nome, subtitle: d.professor, date: null }))));
    tarefas.push(consulta<{ id: string; nome: string; professor: string | null }>("disciplinas", "id, nome, professor", "professor")
      .then((l) => l.map((d) => ({ category: "college" as const, type: "subject", id: d.id, title: d.nome, subtitle: d.professor, date: null }))));
    tarefas.push(consulta<{ id: string; titulo: string; tipo: string; data: string; entregue: boolean }>("avaliacoes", "id, titulo, tipo, data, entregue", "titulo")
      .then((l) => l.map((a) => ({ category: "college" as const, type: a.tipo, id: a.id, title: a.titulo, subtitle: a.entregue ? "entregue" : "pendente", date: a.data }))));
  }
  if (quer("college")) tarefas.push(consulta<{ id: string; titulo: string; entrega_estado: string | null; prazo_em: string | null; prazo_data: string | null }>("classroom_atividades", "id, titulo, entrega_estado, prazo_em, prazo_data", "titulo")
    .then((l) => l.map((a) => ({ category: "college" as const, type: "classroom_assignment", id: a.id, title: a.titulo, subtitle: a.entrega_estado ?? "estado não confirmado", date: a.prazo_data ?? (a.prazo_em ? a.prazo_em.slice(0, 10) : null) }))));
  if (quer("applications")) for (const col of ["empresa", "vaga"]) tarefas.push(consulta<{ id: string; empresa: string; vaga: string; status: string; data_envio: string }>("candidaturas", "id, empresa, vaga, status, data_envio", col)
    .then((l) => l.map((c) => ({ category: "applications" as const, type: "application", id: c.id, title: `${c.vaga}: ${c.empresa}`, subtitle: c.status, date: c.data_envio }))));
  if (quer("freelances")) for (const col of ["titulo", "cliente"]) tarefas.push(consulta<{ id: string; titulo: string; cliente: string; status: string; prazo: string | null }>("freelas", "id, titulo, cliente, status, prazo", col)
    .then((l) => l.map((f) => ({ category: "freelances" as const, type: "freelance", id: f.id, title: f.titulo, subtitle: `${f.cliente} · ${f.status}`, date: f.prazo }))));
  if (quer("projects")) {
    for (const col of ["nome", "resumo"]) tarefas.push(consulta<{ id: string; nome: string; status: string; prazo: string | null }>("projetos", "id, nome, status, prazo", col)
      .then((l) => l.map((p) => ({ category: "projects" as const, type: "project", id: p.id, title: p.nome, subtitle: p.status, date: p.prazo }))));
    tarefas.push(consulta<{ id: string; titulo: string; status: string; projeto_id: string; projetos: { nome: string } | null }>("projeto_features", "id, titulo, status, projeto_id, projetos(nome)", "titulo")
      .then((l) => l.map((f) => ({ category: "projects" as const, type: "project_feature", id: f.id, title: f.titulo, subtitle: `${f.projetos?.nome ?? "projeto"} · ${f.status}`, date: null }))));
  }

  const vistos = new Set<string>();
  const todos = (await Promise.all(tarefas)).flat().filter((r) => {
    const chave = `${r.type}|${r.id}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
  // Ordem estável: categoria, data mais recente primeiro (sem data por último), título.
  todos.sort((a, b) => CATEGORIAS.indexOf(a.category) - CATEGORIAS.indexOf(b.category)
    || (b.date ?? "").localeCompare(a.date ?? "") || a.title.localeCompare(b.title, "pt-BR") || a.id.localeCompare(b.id));
  const { itens, pagination } = paginar(todos, limit, offset);
  return { data: { query: q, categories: categorias, today: agoraSP().data, results: itens }, pagination };
}
