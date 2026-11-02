// Escritas feitas pelo navegador. A RLS garante que só tocam nas linhas do usuário logado.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Periodo } from "@motor";

const falhar = (etapa: string, e: { message: string } | null) => {
  if (e) throw new Error(`${etapa}: ${e.message}`);
};

const slugUnico = (nome: string) =>
  `${nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40)}-${Date.now().toString(36)}`;

const hora = (v: string | null | undefined) => (v ? v : null);

export async function criarHabito(sb: SupabaseClient, nome: string): Promise<string> {
  const { data, error } = await sb.from("habits").insert({ nome: nome.trim(), slug: slugUnico(nome) }).select("id").single();
  falhar("Criar hábito", error);
  return data!.id;
}

export async function renomearHabito(sb: SupabaseClient, id: string, nome: string) {
  const { error } = await sb.from("habits").update({ nome: nome.trim() }).eq("id", id);
  falhar("Renomear hábito", error);
}

/** Arquivar mantém o histórico; o hábito some do dia e das cadeias. */
export async function arquivarHabito(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("habits").update({ arquivado: true }).eq("id", id);
  falhar("Arquivar hábito", error);
}

export interface DadosCadeia {
  nome: string;
  ancora: string;
  diasSemana: number[];
  periodo: Periodo;
  dependeAula: boolean;
  janelaInicio: string | null;
  janelaFim: string | null;
  lembrete: boolean;
}

export async function salvarCadeia(sb: SupabaseClient, d: DadosCadeia, id?: string): Promise<string> {
  const linha = {
    nome: d.nome.trim(), ancora: d.ancora.trim(), dias_semana: d.diasSemana, periodo: d.periodo,
    depende_aula: d.dependeAula, janela_inicio: hora(d.janelaInicio), janela_fim: hora(d.janelaFim), lembrete: d.lembrete,
  };
  if (id) {
    const { error } = await sb.from("chains").update(linha).eq("id", id);
    falhar("Salvar cadeia", error);
    return id;
  }
  const { data: ultima } = await sb.from("chains").select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await sb.from("chains").insert({ ...linha, slug: slugUnico(d.nome), ordem: (ultima?.ordem ?? 0) + 1 }).select("id").single();
  falhar("Criar cadeia", error);
  return data!.id;
}

/** Desativar mantém os checks antigos ligados à cadeia. */
export async function desativarCadeia(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("chains").update({ ativo: false }).eq("id", id);
  falhar("Remover cadeia", error);
}

export interface DadosPasso {
  habitoId: string;
  gatilho: string;
  minimo: string | null;
  completo: string | null;
  naoAntes: string | null;
}

export async function adicionarPasso(sb: SupabaseClient, cadeiaId: string, d: DadosPasso) {
  const { data: ultimo } = await sb.from("chain_steps").select("posicao").eq("chain_id", cadeiaId)
    .order("posicao", { ascending: false }).limit(1).maybeSingle();
  const { error } = await sb.from("chain_steps").insert({
    chain_id: cadeiaId, habit_id: d.habitoId, posicao: (ultimo?.posicao ?? 0) + 1,
    gatilho: d.gatilho.trim(), minimo: d.minimo?.trim() || null, completo: d.completo?.trim() || null, nao_antes: hora(d.naoAntes),
  });
  if (error?.code === "23505") throw new Error("Esse hábito já está nesta cadeia.");
  falhar("Adicionar passo", error);
}

export async function atualizarPasso(sb: SupabaseClient, id: string, d: Omit<DadosPasso, "habitoId">) {
  const { error } = await sb.from("chain_steps").update({
    gatilho: d.gatilho.trim(), minimo: d.minimo?.trim() || null, completo: d.completo?.trim() || null, nao_antes: hora(d.naoAntes),
  }).eq("id", id);
  falhar("Salvar passo", error);
}

export async function removerPasso(sb: SupabaseClient, cadeiaId: string, id: string, restantes: string[]) {
  const { error } = await sb.from("chain_steps").delete().eq("id", id);
  falhar("Remover passo", error);
  await reordenarPassos(sb, cadeiaId, restantes);
}

/**
 * Move um passo para outra cadeia (vai para o fim dela), mantendo gatilho, mínimo, completo e "não antes de".
 * O histórico de registros do hábito continua o mesmo.
 */
export async function moverPasso(sb: SupabaseClient, passoId: string, origemId: string, destinoId: string, restantesOrigem: string[]) {
  const { data: ultimo } = await sb.from("chain_steps").select("posicao").eq("chain_id", destinoId)
    .order("posicao", { ascending: false }).limit(1).maybeSingle();
  const { error } = await sb.from("chain_steps").update({ chain_id: destinoId, posicao: (ultimo?.posicao ?? 0) + 1 }).eq("id", passoId);
  if (error?.code === "23505") throw new Error("Esse hábito já está na cadeia de destino.");
  falhar("Mover passo", error);
  await reordenarPassos(sb, origemId, restantesOrigem);
}

/** Troca a posição de duas cadeias (a ordem define a sequência no Hoje e na Agenda). */
export async function trocarOrdemCadeias(sb: SupabaseClient, a: { id: string; ordem: number }, b: { id: string; ordem: number }) {
  // Se as duas tinham a mesma ordem, desempata para a troca ter efeito.
  const [oa, ob] = a.ordem === b.ordem ? [a.ordem + 1, a.ordem] : [b.ordem, a.ordem];
  const r1 = await sb.from("chains").update({ ordem: oa }).eq("id", a.id);
  falhar("Reordenar cadeias", r1.error);
  const r2 = await sb.from("chains").update({ ordem: ob }).eq("id", b.id);
  falhar("Reordenar cadeias", r2.error);
}

export async function reordenarPassos(sb: SupabaseClient, cadeiaId: string, ids: string[]) {
  const { error } = await sb.rpc("reordenar_passos", { p_chain: cadeiaId, p_ids: ids });
  falhar("Reordenar passos", error);
}

/* ---------- Agenda ---------- */

export interface DadosEvento {
  tipo: "compromisso" | "excecao_rotina" | "prazo";
  titulo: string;
  data: string | null;
  inicio: string | null;
  fim: string | null;
  local: string | null;
  recorrencia: string | null; // "mensal:10"
  lembretesDias: number[];
  lembretesAntes: number[];
}

export async function salvarEvento(sb: SupabaseClient, d: DadosEvento, id?: string) {
  const linha = {
    tipo: d.tipo, titulo: d.titulo.trim(), data: d.recorrencia ? null : d.data,
    inicio: d.tipo === "compromisso" ? hora(d.inicio) : null, fim: d.tipo === "compromisso" ? hora(d.fim) : null,
    local: d.tipo === "compromisso" ? d.local?.trim() || null : null,
    recorrencia: d.tipo === "prazo" ? d.recorrencia : null,
    lembretes_dias: d.tipo === "prazo" && d.recorrencia ? d.lembretesDias : [],
    lembretes_antes: d.tipo === "prazo" && !d.recorrencia ? d.lembretesAntes : [],
    efeito: d.tipo === "excecao_rotina" ? { sem_aula: true } : null,
  };
  const { error } = id ? await sb.from("events").update(linha).eq("id", id) : await sb.from("events").insert(linha);
  falhar("Salvar evento", error);
}

export async function excluirEvento(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("events").delete().eq("id", id);
  falhar("Excluir evento", error);
}

/** Desativar um feriado faz o dia voltar a ter aula (e as cadeias de trajeto). */
export async function definirFeriadoAtivo(sb: SupabaseClient, data: string, ativo: boolean) {
  const { error } = await sb.from("feriados").update({ ativo }).eq("data", data);
  falhar("Atualizar feriado", error);
}

/* ---------- Lembretes ---------- */

export async function salvarHorario(sb: SupabaseClient, hora: string, ativo: boolean, id?: string) {
  const { error } = id
    ? await sb.from("reminder_slots").update({ hora, ativo }).eq("id", id)
    : await sb.from("reminder_slots").insert({ hora, ativo });
  if (error?.code === "23505") throw new Error("Já existe um lembrete nesse horário.");
  falhar("Salvar horário", error);
}

export async function removerHorario(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("reminder_slots").delete().eq("id", id);
  falhar("Remover horário", error);
}

export async function removerAparelho(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("push_subscriptions").delete().eq("id", id);
  falhar("Remover aparelho", error);
}

/* ---------- Freelas ---------- */

export type StatusFreela = "proposta" | "em_andamento" | "entregue" | "pago" | "cancelado";

export interface DadosFreela {
  cliente: string;
  titulo: string;
  descricao: string | null;
  status: StatusFreela;
  prazo: string | null;
  valor: number | null;
  horasEstimadas: number | null;
  repositorioUrl: string | null;
}

export async function salvarFreela(sb: SupabaseClient, d: DadosFreela, id?: string): Promise<string> {
  const linha = {
    cliente: d.cliente.trim(), titulo: d.titulo.trim(), descricao: d.descricao?.trim() || null, status: d.status,
    prazo: d.prazo || null, valor: d.valor, horas_estimadas: d.horasEstimadas, repositorio_url: d.repositorioUrl?.trim() || null,
  };
  if (id) {
    const { error } = await sb.from("freelas").update(linha).eq("id", id);
    falhar("Salvar freela", error);
    return id;
  }
  const { data, error } = await sb.from("freelas").insert(linha).select("id").single();
  falhar("Criar freela", error);
  return data!.id;
}

export async function mudarStatusFreela(sb: SupabaseClient, id: string, status: StatusFreela) {
  const { error } = await sb.from("freelas").update({ status }).eq("id", id);
  falhar("Mudar status", error);
}

export async function marcarPortfolio(sb: SupabaseClient, id: string, registrado: boolean) {
  const { error } = await sb.from("freelas").update({ portfolio_registrado: registrado }).eq("id", id);
  falhar("Atualizar portfólio", error);
}

export async function excluirFreela(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("freelas").delete().eq("id", id);
  falhar("Excluir freela", error);
}

export async function registrarHoras(sb: SupabaseClient, freelaId: string, dataLocal: string, horas: number, nota: string | null) {
  const { error } = await sb.from("freela_time_logs").insert({ freela_id: freelaId, data_local: dataLocal, horas, nota: nota?.trim() || null });
  falhar("Registrar horas", error);
}

export async function removerHoras(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("freela_time_logs").delete().eq("id", id);
  falhar("Remover registro de horas", error);
}

/* ---------- Flexíveis ---------- */

export type ContextoFlex = "dia_util_sem_aula" | "fim_de_semana";

export async function adicionarFlexivel(sb: SupabaseClient, contexto: ContextoFlex, habitoId: string) {
  const { error } = await sb.from("daily_flex_rules").insert({ contexto, habit_id: habitoId, posicao: Date.now() % 100000 });
  if (error?.code === "23505") throw new Error("Esse hábito já é flexível nesse tipo de dia.");
  falhar("Adicionar flexível", error);
}

export async function removerFlexivel(sb: SupabaseClient, contexto: ContextoFlex, habitoId: string) {
  const { error } = await sb.from("daily_flex_rules").delete().eq("contexto", contexto).eq("habit_id", habitoId);
  falhar("Remover flexível", error);
}

/* ---------- Tarefas ---------- */

export interface DadosTarefa { titulo: string; data: string; hora: string | null; notas: string | null; prioridade: number }

export async function salvarTarefa(sb: SupabaseClient, d: DadosTarefa, id?: string) {
  const linha = { titulo: d.titulo.trim(), data: d.data, hora: hora(d.hora), notas: d.notas?.trim() || null, prioridade: d.prioridade };
  const { error } = id ? await sb.from("tarefas").update(linha).eq("id", id) : await sb.from("tarefas").insert(linha);
  falhar("Salvar tarefa", error);
}

export async function concluirTarefa(sb: SupabaseClient, id: string, concluida: boolean) {
  const { error } = await sb.from("tarefas").update({ concluida_em: concluida ? new Date().toISOString() : null }).eq("id", id);
  falhar("Atualizar tarefa", error);
}

export async function adiarTarefa(sb: SupabaseClient, id: string, data: string) {
  const { error } = await sb.from("tarefas").update({ data }).eq("id", id);
  falhar("Adiar tarefa", error);
}

export async function excluirTarefa(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("tarefas").delete().eq("id", id);
  falhar("Excluir tarefa", error);
}

/* ---------- Faculdade ---------- */

export async function salvarSemestre(sb: SupabaseClient, d: { nome: string; inicio: string; fim: string }, id?: string): Promise<string> {
  const linha = { nome: d.nome.trim(), inicio: d.inicio, fim: d.fim };
  if (id) {
    const { error } = await sb.from("semestres").update(linha).eq("id", id);
    falhar("Salvar semestre", error);
    return id;
  }
  const { data, error } = await sb.from("semestres").insert(linha).select("id").single();
  falhar("Criar semestre", error);
  return data!.id;
}

export interface DadosDisciplina { semestreId: string; nome: string; professor: string | null; sala: string | null; cor: string }
export interface Horario { diaSemana: number; inicio: string; fim: string }

/** Salva a disciplina e substitui os horários semanais dela. */
export async function salvarDisciplina(sb: SupabaseClient, d: DadosDisciplina, horarios: Horario[], id?: string) {
  const linha = { semestre_id: d.semestreId, nome: d.nome.trim(), professor: d.professor?.trim() || null, sala: d.sala?.trim() || null, cor: d.cor };
  let disciplinaId = id;
  if (id) {
    const { error } = await sb.from("disciplinas").update(linha).eq("id", id);
    falhar("Salvar disciplina", error);
  } else {
    const { data, error } = await sb.from("disciplinas").insert(linha).select("id").single();
    falhar("Criar disciplina", error);
    disciplinaId = data!.id;
  }
  const { error: e1 } = await sb.from("aulas").delete().eq("disciplina_id", disciplinaId);
  falhar("Atualizar horários", e1);
  if (horarios.length) {
    const { error: e2 } = await sb.from("aulas").insert(horarios.map((h) => ({ disciplina_id: disciplinaId, dia_semana: h.diaSemana, inicio: h.inicio, fim: h.fim })));
    falhar("Salvar horários", e2);
  }
}

export async function excluirDisciplina(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("disciplinas").delete().eq("id", id);
  falhar("Excluir disciplina", error);
}

export interface DadosAvaliacao {
  tipo: "prova" | "trabalho" | "atividade";
  titulo: string;
  disciplinaId: string | null;
  data: string;
  hora: string | null;
  descricao: string | null;
}

export async function salvarAvaliacao(sb: SupabaseClient, d: DadosAvaliacao, id?: string) {
  const linha = { tipo: d.tipo, titulo: d.titulo.trim(), disciplina_id: d.disciplinaId, data: d.data, hora: hora(d.hora), descricao: d.descricao?.trim() || null };
  const { error } = id ? await sb.from("avaliacoes").update(linha).eq("id", id) : await sb.from("avaliacoes").insert(linha);
  falhar("Salvar avaliação", error);
}

export async function marcarAvaliacao(sb: SupabaseClient, id: string, entregue: boolean, nota?: number | null) {
  const { error } = await sb.from("avaliacoes").update({ entregue, ...(nota !== undefined ? { nota } : {}) }).eq("id", id);
  falhar("Atualizar avaliação", error);
}

export async function excluirAvaliacao(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("avaliacoes").delete().eq("id", id);
  falhar("Excluir avaliação", error);
}

/* ---------- Tarefas recorrentes ---------- */

export interface DadosRecorrencia {
  titulo: string;
  regra: "diaria" | "semanal" | "mensal";
  diasSemana: number[];
  diaMes: number | null;
  hora: string | null;
  prioridade: number;
  inicio: string;
}

export async function salvarRecorrencia(sb: SupabaseClient, d: DadosRecorrencia, id?: string) {
  const linha = {
    titulo: d.titulo.trim(), regra: d.regra, dias_semana: d.regra === "semanal" ? d.diasSemana : [],
    dia_mes: d.regra === "mensal" ? d.diaMes : null, hora: hora(d.hora), prioridade: d.prioridade, inicio: d.inicio,
  };
  // Ao editar, o início original é mantido (só a regra muda).
  const { inicio, ...semInicio } = linha;
  const { error } = id ? await sb.from("tarefas_recorrentes").update(semInicio).eq("id", id) : await sb.from("tarefas_recorrentes").insert({ ...semInicio, inicio });
  falhar("Salvar repetição", error);
}

export async function pararRecorrencia(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("tarefas_recorrentes").update({ ativa: false }).eq("id", id);
  falhar("Parar repetição", error);
}

/* ---------- Candidaturas ---------- */

export interface DadosCandidatura {
  empresa: string;
  vaga: string;
  link: string | null;
  origem: string | null;
  status: "enviada" | "em_processo" | "entrevista" | "oferta" | "recusada" | "desisti";
  dataEnvio: string;
  proximaAcao: string | null;
  proximaData: string | null;
  proximaHora: string | null;
  notas: string | null;
}

export async function salvarCandidatura(sb: SupabaseClient, d: DadosCandidatura, id?: string) {
  const linha = {
    empresa: d.empresa.trim(), vaga: d.vaga.trim(), link: d.link?.trim() || null, origem: d.origem?.trim() || null,
    status: d.status, data_envio: d.dataEnvio, proxima_acao: d.proximaAcao?.trim() || null,
    proxima_data: d.proximaData || null, proxima_hora: d.proximaData ? hora(d.proximaHora) : null, notas: d.notas?.trim() || null,
  };
  const { error } = id ? await sb.from("candidaturas").update(linha).eq("id", id) : await sb.from("candidaturas").insert(linha);
  falhar("Salvar candidatura", error);
}

export async function excluirCandidatura(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("candidaturas").delete().eq("id", id);
  falhar("Excluir candidatura", error);
}

/**
 * Registrar uma candidatura no dia cumpre o mínimo do hábito "Enviar candidaturas" (slug "candidatura").
 * Só marca se o hábito ainda não tiver registro no dia; nunca rebaixa um "completo".
 */
export async function marcarHabitoCandidatura(sb: SupabaseClient, data: string): Promise<string | null> {
  const { data: h } = await sb.from("habits").select("id, nome").eq("slug", "candidatura").eq("arquivado", false).maybeSingle();
  if (!h) return null;
  const { data: ja } = await sb.from("checks").select("id").eq("habit_id", h.id).eq("data_local", data).maybeSingle();
  if (ja) return null;
  const { error } = await sb.from("checks").insert({ habit_id: h.id, data_local: data, status: "minimo", nota: "Marcado ao registrar uma candidatura." });
  return error ? null : h.nome;
}

/* ---------- Foco ---------- */

export async function registrarFoco(sb: SupabaseClient, habitoId: string | null, dataLocal: string, minutos: number) {
  const { error } = await sb.from("focos").insert({ habit_id: habitoId, data_local: dataLocal, minutos: Math.max(1, Math.round(minutos)) });
  falhar("Registrar foco", error);
}

export async function definirFocoDaSemana(sb: SupabaseClient, habitoId: string | null, semana: string) {
  const { error } = await sb.from("profiles").update({ foco_habito_id: habitoId, foco_semana: habitoId ? semana : null }).not("user_id", "is", null);
  falhar("Definir foco da semana", error);
}

/* ---------- Projetos ---------- */

/** Campos editáveis do projeto, com os nomes das colunas (salvos aos poucos, campo a campo). */
export type CamposProjeto = Partial<{
  nome: string; resumo: string | null; descricao: string | null; problema: string | null; publico: string | null;
  status: string; prioridade: string; categoria: string | null; tecnologias: string[]; repositorio_url: string | null;
  site_url: string | null; inicio: string | null; prazo: string | null; proximo_passo: string | null; notas: string | null; fixado: boolean;
}>;

export async function criarProjeto(sb: SupabaseClient, d: CamposProjeto & { nome: string }): Promise<string> {
  const { data, error } = await sb.from("projetos").insert({ ...d, nome: d.nome.trim() }).select("id").single();
  falhar("Criar projeto", error);
  return data!.id;
}

export async function atualizarProjeto(sb: SupabaseClient, id: string, d: CamposProjeto) {
  const { error } = await sb.from("projetos").update(d).eq("id", id);
  falhar("Salvar projeto", error);
}

export async function excluirProjeto(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("projetos").delete().eq("id", id);
  falhar("Excluir projeto", error);
}

export async function criarFeature(sb: SupabaseClient, projetoId: string, d: { titulo: string; prioridade: string; ordem: number }) {
  const { data, error } = await sb.from("projeto_features").insert({ projeto_id: projetoId, titulo: d.titulo.trim(), prioridade: d.prioridade, ordem: d.ordem })
    .select("id, projeto_id, titulo, descricao, status, prioridade, ordem, concluida_em").single();
  falhar("Adicionar feature", error);
  return data!;
}

export async function atualizarFeature(sb: SupabaseClient, id: string, d: Partial<{ titulo: string; descricao: string | null; status: string; prioridade: string; ordem: number }>) {
  const { error } = await sb.from("projeto_features").update(d).eq("id", id);
  falhar("Salvar feature", error);
}

export async function excluirFeature(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("projeto_features").delete().eq("id", id);
  falhar("Excluir feature", error);
}

/* ---------- Dias sem aula e faltas ---------- */

/** Um dia sem aula por qualquer motivo: exceção de rotina (os trajetos saem e os hábitos deles viram flexíveis). */
export async function marcarSemAula(sb: SupabaseClient, datas: string[], motivo: string) {
  if (!datas.length) return;
  const titulo = motivo.trim() || "Sem aula";
  const { error } = await sb.from("events").insert(datas.map((data) => ({ tipo: "excecao_rotina", titulo, data, efeito: { sem_aula: true } })));
  falhar("Marcar dia sem aula", error);
}

/** Desfaz os dias sem aula marcados para a data (não mexe em feriado; para isso, Agenda → feriados). */
export async function voltarATerAula(sb: SupabaseClient, data: string) {
  const { error } = await sb.from("events").delete().eq("tipo", "excecao_rotina").eq("data", data).contains("efeito", { sem_aula: true });
  falhar("Voltar a ter aula", error);
}

/**
 * Registra a falta nas disciplinas escolhidas. Com "não fui", o dia também vira dia sem aula
 * (evento "Faltei", ligado às faltas para sair junto quando elas forem apagadas).
 */
export async function registrarFalta(sb: SupabaseClient, d: { data: string; disciplinaIds: string[]; motivo: string | null; naoFui: boolean }) {
  let eventoId: string | null = null;
  if (d.naoFui) {
    const { data: ev, error } = await sb.from("events")
      .insert({ tipo: "excecao_rotina", titulo: d.motivo?.trim() ? `Faltei: ${d.motivo.trim()}` : "Faltei", data: d.data, efeito: { sem_aula: true } })
      .select("id").single();
    falhar("Registrar falta", error);
    eventoId = ev!.id;
  }
  const { error } = await sb.from("faltas").upsert(
    d.disciplinaIds.map((disciplina_id) => ({ data: d.data, disciplina_id, motivo: d.motivo?.trim() || null, evento_id: eventoId })),
    { onConflict: "user_id,data,disciplina_id" },
  );
  if (error && eventoId) await sb.from("events").delete().eq("id", eventoId);
  falhar("Registrar falta", error);
}

export async function removerFalta(sb: SupabaseClient, falta: { id: string; evento_id: string | null }) {
  const { error } = await sb.from("faltas").delete().eq("id", falta.id);
  falhar("Remover falta", error);
  if (!falta.evento_id) return;
  // O dia sem aula criado com a falta só sai quando não sobra nenhuma falta ligada a ele.
  const { count } = await sb.from("faltas").select("id", { count: "exact", head: true }).eq("evento_id", falta.evento_id);
  if (!count) await sb.from("events").delete().eq("id", falta.evento_id);
}
