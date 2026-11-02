// Importa dados_iniciais.json para um usuário já cadastrado. Idempotente: pode rodar
// várias vezes; usa upsert pelas chaves naturais (slug, data, hora). Não cria checks nem freelas.
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizar, type DadosIniciais } from "./importar-dados";

function ok<T>(r: { data: T | null; error: { message: string } | null }, etapa: string): T {
  if (r.error) throw new Error(`${etapa}: ${r.error.message}`);
  return r.data as T;
}

/** `sb` precisa ser um cliente com a chave secreta (service role). */
export async function aplicarSeed(sb: SupabaseClient, email: string, arquivo = path.join(process.cwd(), "dados_iniciais.json")) {
  const bruto = JSON.parse(readFileSync(arquivo, "utf8")) as DadosIniciais;
  const d = normalizar(bruto);

  const { data: lista, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = lista.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`Nenhum usuário com o e-mail ${email}. Crie a conta no app primeiro.`);
  const uid = user.id;

  ok(await sb.from("profiles").upsert({
    user_id: uid, fuso: bruto.fuso, dias_de_aula: d.diasDeAula, rotina: d.rotina,
    semestre_inicio: d.semestre.inicio, semestre_fim: d.semestre.fim, inicio_rastreamento: d.inicioRastreamento,
  }), "perfil");

  // Semestre atual (datas de dados_iniciais.json); as disciplinas você cadastra em Faculdade.
  const { count: semestres } = await sb.from("semestres").select("id", { count: "exact", head: true }).eq("user_id", uid);
  if (!semestres) {
    const [ano, mes] = d.semestre.fim.split("-").map(Number);
    ok(await sb.from("semestres").insert({ user_id: uid, nome: `${mes > 6 ? 2 : 1}º semestre de ${ano}`, inicio: d.semestre.inicio, fim: d.semestre.fim }), "semestre");
  }

  const habitos = ok(await sb.from("habits").upsert(
    d.habitos.map((h) => ({ user_id: uid, slug: h.id, nome: h.nome, somente_domingo: !!h.somenteDomingo })),
    { onConflict: "user_id,slug" },
  ).select("id, slug"), "hábitos");
  const H = new Map(habitos.map((h) => [h.slug, h.id]));

  const cadeias = ok(await sb.from("chains").upsert(
    d.cadeias.map((c) => ({
      user_id: uid, slug: c.id, nome: c.nome, ancora: c.ancora, dias_semana: c.diasSemana,
      depende_aula: c.dependeAula, periodo: c.periodo, janela_inicio: c.janelaInicio, janela_fim: c.janelaFim,
      nao_antes: c.naoAntes, lembrete: c.lembrete, ordem: c.ordem,
    })),
    { onConflict: "user_id,slug" },
  ).select("id, slug"), "cadeias");
  const C = new Map(cadeias.map((c) => [c.slug, c.id]));

  ok(await sb.from("chain_steps").upsert(
    d.cadeias.flatMap((c) => c.passos.map((p) => ({
      user_id: uid, chain_id: C.get(c.id), habit_id: H.get(p.habitoId), posicao: p.posicao,
      gatilho: p.gatilho, minimo: p.minimo, completo: p.completo, nao_antes: p.naoAntes,
    }))),
    { onConflict: "chain_id,habit_id" },
  ), "passos");

  ok(await sb.from("daily_flex_rules").upsert(
    d.regrasFlex.flatMap((r) => r.habitoIds.map((id, i) => ({ user_id: uid, contexto: r.contexto, habit_id: H.get(id), posicao: i + 1 }))),
    { onConflict: "user_id,contexto,habit_id" },
  ), "flexíveis");

  ok(await sb.from("events").upsert(
    d.eventos.map((e) => ({
      user_id: uid, slug: e.id, tipo: e.tipo, titulo: e.titulo, data: e.data, inicio: e.inicio, fim: e.fim,
      local: e.local, recorrencia: e.recorrencia, lembretes_dias: e.lembretesDias,
      lembretes_a_partir_de: e.lembretesAPartirDe, efeito: e.efeito,
      descricao: d.eventosExtras[e.id].descricao, observacao: d.eventosExtras[e.id].observacao,
    })),
    { onConflict: "user_id,slug" },
  ), "agenda");

  // Feriados: ignoreDuplicates preserva um feriado que você tenha desativado.
  ok(await sb.from("feriados").upsert(
    d.feriados.map((f) => ({ user_id: uid, data: f.data, nome: f.nome, ativo: f.ativo })),
    { onConflict: "user_id,data", ignoreDuplicates: true },
  ), "feriados");

  ok(await sb.from("reminder_slots").upsert(
    d.lembretes.map((hora) => ({ user_id: uid, hora })),
    { onConflict: "user_id,hora", ignoreDuplicates: true },
  ), "lembretes");

  const existentes = ok(await sb.from("pendencias").select("texto").eq("user_id", uid), "pendências");
  const novas = d.pendencias.filter((t) => !existentes.some((e) => e.texto === t));
  if (novas.length) ok(await sb.from("pendencias").insert(novas.map((texto) => ({ user_id: uid, texto }))), "pendências");

  const conta = async (t: string) => (await sb.from(t).select("*", { count: "exact", head: true }).eq("user_id", uid)).count ?? 0;
  const tabelas = ["habits", "chains", "chain_steps", "daily_flex_rules", "events", "feriados", "reminder_slots", "pendencias", "checks", "freelas"];
  const contagens: Record<string, number> = {};
  for (const t of tabelas) contagens[t] = await conta(t);
  return { userId: uid, contagens };

}
