// Sincronização AgendaJeff ← APIClassroom. Idempotente por (user_id, source, course_id, activity_id),
// grava só o que mudou, nunca toca nos campos pessoais e nunca apaga por falha: atividade que some numa
// sincronização completa da turma fica marcada como ausente (fora da agenda), não é excluída.
// A decisão pessoal (resolucao_local, resolvida_em) nunca entra no upsert: só o usuário a altera.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ErroAuth } from "./auth0";
import { ClienteClassroom, ErroClassroom } from "./cliente";
import type { ConfigClassroom } from "./config";
import { compararSnapshot, juntarPorAtividade } from "./normalizar";
import { fornecedorDeToken, marcarReconectar } from "./tokens";
import type { LinhaOficial } from "./tipos";

export interface ResumoSync {
  resultado: "ok" | "parcial" | "erro";
  turmasAcompanhadas: number;
  turmasSincronizadas: number;
  novas: number;
  atualizadas: number;
  entregasConfirmadas: number;
  devolvidas: number;
  prazosAlterados: number;
  ausentes: number;
  revisar: number;              // resolvidas no AgendaJeff que mudaram no Classroom
  erros: { turma: string | null; mensagem: string }[];
  motivo?: "desconectado" | "em_andamento" | "reconectar" | "sem_turmas";
}

const TRAVA_MIN = 5;          // uma sincronização travada há mais de 5 min é considerada morta
const ORCAMENTO_MS = 45_000;  // a função da Vercel tem 60 s; sobra margem para gravar o resultado
const CONCORRENCIA = 2;       // turmas ao mesmo tempo (o APIClassroom limita 4 por instância e 60/min)

const vazio = (): ResumoSync => ({ resultado: "ok", turmasAcompanhadas: 0, turmasSincronizadas: 0, novas: 0, atualizadas: 0, entregasConfirmadas: 0, devolvidas: 0, prazosAlterados: 0, ausentes: 0, revisar: 0, erros: [] });
const falhar = (etapa: string, e: { message: string } | null) => { if (e) throw new Error(`${etapa}: ${e.message}`); };
/** Mensagem segura para guardar e mostrar (sem token, sem corpo de resposta). */
const mensagem = (e: unknown) => (e instanceof ErroClassroom || e instanceof ErroAuth ? e.message : "Falha interna na sincronização.");

export async function sincronizarClassroom(admin: SupabaseClient, cfg: ConfigClassroom, userId: string, origem: "manual" | "automatica", opcoes: { fetch?: typeof fetch } = {}): Promise<ResumoSync> {
  const resumo = vazio();
  const inicio = new Date();
  // 1. Trava por usuário (atualização condicional: só uma sincronização por vez).
  const limite = new Date(inicio.getTime() - TRAVA_MIN * 60_000).toISOString();
  const { data: trava, error: erroTrava } = await admin.from("classroom_conexoes").update({ sync_iniciada_em: inicio.toISOString() })
    .eq("user_id", userId).eq("estado", "conectado").or(`sync_iniciada_em.is.null,sync_iniciada_em.lt.${limite}`).select("user_id");
  falhar("Trava da sincronização", erroTrava);
  if (!trava?.length) {
    const { data: c } = await admin.from("classroom_conexoes").select("estado").eq("user_id", userId).maybeSingle();
    return { ...resumo, resultado: "erro", motivo: !c || c.estado === "desconectado" ? "desconectado" : c.estado === "reconectar" ? "reconectar" : "em_andamento" };
  }
  const { data: log } = await admin.from("classroom_sincronizacoes").insert({ user_id: userId, origem, iniciada_em: inicio.toISOString() }).select("id").single();
  const cliente = new ClienteClassroom(cfg, { token: fornecedorDeToken(admin, cfg, userId), ate: inicio.getTime() + ORCAMENTO_MS, fetch: opcoes.fetch });

  try {
    // 2. Turmas: atualiza nome/estado sem mexer na escolha do usuário; as que sumiram ficam com estado nulo.
    const turmas = await cliente.turmas();
    const agora = new Date().toISOString();
    if (turmas.length) {
      const { error } = await admin.from("classroom_turmas").upsert(turmas.filter((t) => /^[A-Za-z0-9_-]{1,180}$/.test(t.id)).map((t) => ({
        user_id: userId, course_id: t.id, nome: String(t.nome ?? "").slice(0, 300) || t.id, estado: t.status ?? null,
        aliases: Array.isArray(t.aliases) ? t.aliases.slice(0, 20).map((a) => String(a).slice(0, 80)) : [],
        link: typeof t.link === "string" && t.link.startsWith("https://") ? t.link : null, atualizado_origem: t.atualizado_em ?? null, visto_em: agora,
      })), { onConflict: "user_id,course_id" });
      falhar("Gravar turmas", error);
    }
    await admin.from("classroom_turmas").update({ estado: null }).eq("user_id", userId).lt("visto_em", agora);

    // 3. Turmas acompanhadas, as mais antigas primeiro (se o tempo acabar, a próxima rodada continua delas).
    const { data: escolhidas, error: erroEsc } = await admin.from("classroom_turmas").select("course_id, nome, nome_exibicao, estado")
      .eq("user_id", userId).eq("acompanhar", true).order("ultima_sync_ok_em", { ascending: true, nullsFirst: true });
    falhar("Ler turmas acompanhadas", erroEsc);
    const lista = (escolhidas ?? []).filter((t) => t.estado); // turma que não aparece mais não é consultada
    resumo.turmasAcompanhadas = (escolhidas ?? []).length;
    for (const t of (escolhidas ?? []).filter((t) => !t.estado)) resumo.erros.push({ turma: t.nome_exibicao || t.nome, mensagem: "A turma não aparece mais entre as ativas do Classroom." });
    if (!resumo.turmasAcompanhadas) resumo.motivo = "sem_turmas";

    let parar = false;
    const fila = [...lista];
    const trabalhar = async () => {
      for (let t = fila.shift(); t && !parar; t = fila.shift()) {
        try {
          await sincronizarTurma(admin, cliente, userId, t.course_id, resumo);
          resumo.turmasSincronizadas++;
          await admin.from("classroom_turmas").update({ ultima_sync_ok_em: new Date().toISOString(), ultimo_erro: null }).eq("user_id", userId).eq("course_id", t.course_id);
        } catch (e) {
          if ((e instanceof ErroClassroom && e.reautorizar) || (e instanceof ErroAuth && e.codigo !== "indisponivel")) { parar = true; throw e; }
          resumo.erros.push({ turma: t.nome_exibicao || t.nome, mensagem: mensagem(e) });
          await admin.from("classroom_turmas").update({ ultimo_erro: mensagem(e) }).eq("user_id", userId).eq("course_id", t.course_id);
          if (e instanceof ErroClassroom && e.codigo === "tempo_esgotado") parar = true;
        }
      }
    };
    await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhar));
    resumo.resultado = resumo.turmasSincronizadas === lista.length && !resumo.erros.length ? "ok" : resumo.turmasSincronizadas > 0 ? "parcial" : lista.length ? "erro" : resumo.erros.length ? "parcial" : "ok";
  } catch (e) {
    resumo.resultado = "erro";
    resumo.erros.push({ turma: null, mensagem: mensagem(e) });
    if ((e instanceof ErroClassroom && (e.reautorizar || e.status === 403)) || (e instanceof ErroAuth && e.codigo !== "indisponivel")) {
      resumo.motivo = "reconectar";
      await marcarReconectar(admin, userId);
    }
    if (!(e instanceof ErroClassroom || e instanceof ErroAuth)) console.error(`[classroom sync] ${(e as Error)?.message ?? "erro"}`);
  } finally {
    const fim = new Date().toISOString();
    const publico = { ...resumo, chamadas: cliente.chamadas };
    await admin.from("classroom_conexoes").update({
      sync_iniciada_em: null, ultima_sync_em: fim, ultima_sync_resultado: publico, atualizado_em: fim,
      ...(resumo.resultado === "ok" ? { ultima_sync_ok_em: fim } : {}),
    }).eq("user_id", userId);
    if (log) await admin.from("classroom_sincronizacoes").update({ terminada_em: fim, resultado: resumo.resultado, resumo: publico, erros: resumo.erros }).eq("id", log.id);
  }
  return resumo;
}

/** Uma turma: todas as páginas de atividades e de entregas, junção, comparação e gravação do que mudou. */
async function sincronizarTurma(admin: SupabaseClient, cliente: ClienteClassroom, userId: string, courseId: string, resumo: ResumoSync) {
  const [atividades, entregas] = await Promise.all([cliente.atividades(courseId), cliente.entregas(courseId)]);
  const novas = juntarPorAtividade(atividades, entregas, courseId);
  const { data: existentes, error } = await admin.from("classroom_atividades")
    .select("id, activity_id, titulo, descricao, descricao_truncada, tipo, link, anexos, estado_publicacao, pontuacao_maxima, prazo_em, prazo_data, prazo_precisao, criado_origem, atualizado_origem, entrega_id, entrega_estado, entrega_atrasada, nota, entrega_atualizada_origem, entrega_link, ausente_desde, resolucao_local")
    .eq("user_id", userId).eq("source", "google_classroom").eq("course_id", courseId);
  falhar("Ler atividades guardadas", error);
  const porId = new Map((existentes ?? []).map((e) => [e.activity_id as string, e]));
  const agora = new Date().toISOString();
  const gravar: (LinhaOficial & Record<string, unknown>)[] = [];
  const soVistas: string[] = [];

  for (const n of novas) {
    const antes = porId.get(n.activity_id);
    if (!antes) {
      gravar.push({ ...n, user_id: userId, source: "google_classroom", visto_em: agora, ausente_desde: null });
      resumo.novas++;
      continue;
    }
    const { mudancas, mudouAlgo } = compararSnapshot(antes as Partial<LinhaOficial>, n);
    if (!mudouAlgo) {
      if (antes.ausente_desde) gravar.push({ ...n, user_id: userId, source: "google_classroom", visto_em: agora, ausente_desde: null });
      else soVistas.push(antes.id as string);
      continue;
    }
    const extra: Record<string, unknown> = { user_id: userId, source: "google_classroom", visto_em: agora, ausente_desde: null };
    if (mudancas.length) {
      extra.mudou_em = agora;
      extra.mudancas = mudancas;
      resumo.atualizadas++;
      // Atividade resolvida no AgendaJeff mudou no Classroom: a decisão fica, mas pede revisão
      // (anexos ou só a descrição não pedem).
      if (antes.resolucao_local && mudancas.some((m) => m !== "anexos" && m !== "descricao")) {
        extra.revisar_desde = agora;
        resumo.revisar++;
      }
    }
    if (mudancas.includes("prazo")) {
      extra.prazo_anterior = { em: antes.prazo_em, data: antes.prazo_data, precisao: antes.prazo_precisao };
      resumo.prazosAlterados++;
    }
    if (mudancas.includes("entrega") && n.entrega_estado === "TURNED_IN") resumo.entregasConfirmadas++;
    if (mudancas.includes("entrega") && n.entrega_estado === "RETURNED") resumo.devolvidas++;
    gravar.push({ ...n, ...extra });
  }

  // Upsert só dos novos e alterados: as colunas pessoais não entram, então ficam como estão. Linhas com conjuntos
  // de colunas diferentes vão em lotes separados (no upsert em lote, coluna ausente numa linha viraria o padrão).
  const lotes = new Map<string, typeof gravar>();
  for (const l of gravar) {
    const chave = Object.keys(l).sort().join(",");
    lotes.set(chave, [...(lotes.get(chave) ?? []), l]);
  }
  for (const lote of lotes.values()) for (let i = 0; i < lote.length; i += 200) {
    const { error: e } = await admin.from("classroom_atividades").upsert(lote.slice(i, i + 200), { onConflict: "user_id,source,course_id,activity_id" });
    falhar("Gravar atividades", e);
  }
  for (let i = 0; i < soVistas.length; i += 200) {
    const { error: e } = await admin.from("classroom_atividades").update({ visto_em: agora }).in("id", soVistas.slice(i, i + 200));
    falhar("Marcar atividades vistas", e);
  }
  // Ausentes: estavam guardadas, não vieram nesta leitura completa da turma.
  const vistasAgora = new Set(novas.map((n) => n.activity_id));
  const sumiram = (existentes ?? []).filter((e) => !vistasAgora.has(e.activity_id as string) && !e.ausente_desde).map((e) => e.id as string);
  if (sumiram.length) {
    const { error: e } = await admin.from("classroom_atividades").update({ ausente_desde: agora }).in("id", sumiram);
    falhar("Marcar atividades ausentes", e);
    resumo.ausentes += sumiram.length;
  }
}
