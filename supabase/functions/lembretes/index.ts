// Disparo agendado dos lembretes. Chamado pelo pg_cron a cada 5 minutos.
// Para cada usuário e horário ativo: se o horário venceu há menos de 30 min e ainda não
// foi processado hoje, monta o conteúdo com o motor e envia (ou registra "sem pendências").
import { createClient } from "npm:@supabase/supabase-js@2";
import { agoraSP, conteudoLembrete, diaDaSemana, ehUltimoDiaDoMes, horarioVencido, horariosPeriodicos, minutos, periodoDoSlot, resolverDia } from "../_shared/motor/index.ts";
import { carregarChecks, carregarContexto, carregarTarefas } from "../_shared/carregar.ts";
import { cors, enviarParaUsuario, json } from "../_shared/push.ts";
import { montarLembretePeriodico } from "../_shared/periodico.ts";

const JANELA_MIN = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ erro: "não autorizado" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Testes: {"agora": "2026-10-13T11:02:00Z", "usuario": "<uuid>"} simula o instante e restringe a um usuário.
  const corpo = await req.json().catch(() => ({}));
  const agora = agoraSP(corpo.agora ? new Date(corpo.agora) : new Date());
  const w = diaDaSemana(agora.data);

  // Exemplo do lembrete periódico para um usuário, agora (verificação manual, protegida pelo segredo do cron).
  if (corpo.testePeriodico && corpo.usuario) {
    try {
      const msg = await montarLembretePeriodico(admin, agora.data, agora.hora, corpo.usuario);
      const r = await enviarParaUsuario(admin, msg, { tipo: "teste", userId: corpo.usuario, dataLocal: agora.data });
      return json({ agora, mensagem: msg, resultados: r });
    } catch (e) {
      return json({ erro: (e as Error).message }, 500);
    }
  }

  let consulta = admin.from("reminder_slots").select("user_id, hora, dias_semana").eq("ativo", true);
  if (corpo.usuario) consulta = consulta.eq("user_id", corpo.usuario);
  const { data: slots, error } = await consulta;
  if (error) return json({ erro: error.message }, 500);

  const vencidos = (slots ?? []).filter((s) => {
    const dif = minutos(agora.hora) - minutos(s.hora.slice(0, 5));
    return s.dias_semana.includes(w) && dif >= 0 && dif < JANELA_MIN;
  });

  const relatorio = [];
  for (const s of vencidos) {
    const hora = s.hora.slice(0, 5);
    const { count } = await admin.from("notification_log").select("id", { count: "exact", head: true })
      .eq("user_id", s.user_id).eq("tipo", "agendado").eq("slot_hora", s.hora).eq("data_local", agora.data);
    if (count) continue; // já processado hoje

    try {
      const ctx = await carregarContexto(admin, s.user_id);
      const checks = await carregarChecks(admin, agora.data, agora.data, s.user_id);
      const dia = resolverDia(agora.data, ctx);
      const tarefas = (await carregarTarefas(admin, agora.data, s.user_id)).filter((t) => !t.concluidaEm).map((t) => t.titulo);
      let msg = conteudoLembrete(hora, dia, checks, ctx.habitos, tarefas);
      // Sábado de manhã: convite para organizar a semana.
      if (w === 6 && periodoDoSlot(hora) === "manha") {
        const linha = "Sábado: planeje a semana (revisão, provas, prazos e foco)";
        msg = msg ? { ...msg, corpo: `${msg.corpo}\n${linha}` } : { titulo: "Manhã", corpo: linha, periodo: "manha", pendentes: 0, url: "/semana" };
      }
      // Domingo à noite: avisa que a revisão semanal está pronta.
      if (w === 0 && periodoDoSlot(hora) === "noite") {
        const linha = "Revisão semanal pronta em Insights";
        msg = msg ? { ...msg, corpo: `${msg.corpo}\n${linha}` } : { titulo: "Noite", corpo: linha, periodo: "noite", pendentes: 0, url: "/insights#revisao" };
      }
      // Último dia do mês à noite: revisão mensal.
      if (ehUltimoDiaDoMes(agora.data) && periodoDoSlot(hora) === "noite") {
        const linha = "Fim do mês: revisão mensal pronta em Mês";
        msg = msg ? { ...msg, corpo: `${msg.corpo}\n${linha}` } : { titulo: "Noite", corpo: linha, periodo: "noite", pendentes: 0, url: "/mes?aba=revisao" };
      }
      if (!msg) {
        await admin.from("notification_log").insert({ user_id: s.user_id, tipo: "agendado", slot_hora: s.hora, data_local: agora.data, status: "sem_pendencias" });
        relatorio.push({ usuario: s.user_id, hora, resultado: "sem pendências" });
        continue;
      }
      const r = await enviarParaUsuario(admin, { titulo: msg.titulo, corpo: msg.corpo, url: msg.url, pendentes: msg.pendentes },
        { tipo: "agendado", userId: s.user_id, dataLocal: agora.data, slotHora: s.hora });
      relatorio.push({ usuario: s.user_id, hora, resultado: r });
    } catch (e) {
      await admin.from("notification_log").insert({ user_id: s.user_id, tipo: "agendado", slot_hora: s.hora, data_local: agora.data, status: "erro", erro: (e as Error).message });
      relatorio.push({ usuario: s.user_id, hora, erro: (e as Error).message });
    }
  }
  // Lembretes periódicos (a cada N horas, dentro da janela escolhida em Ajustes).
  let perfis = admin.from("profiles").select("user_id, periodico_intervalo, periodico_inicio, periodico_fim").eq("periodico_ativo", true);
  if (corpo.usuario) perfis = perfis.eq("user_id", corpo.usuario);
  const { data: ativos, error: erroPerfis } = await perfis;
  if (erroPerfis) return json({ erro: erroPerfis.message, relatorio }, 500);
  for (const p of ativos ?? []) {
    const slot = horarioVencido(horariosPeriodicos(p.periodico_inicio.slice(0, 5), p.periodico_fim.slice(0, 5), p.periodico_intervalo), agora.hora, JANELA_MIN);
    if (!slot) continue;
    const slotHora = `${slot}:00`;
    const { count: feito } = await admin.from("notification_log").select("id", { count: "exact", head: true })
      .eq("user_id", p.user_id).eq("tipo", "periodico").eq("slot_hora", slotHora).eq("data_local", agora.data);
    if (feito) continue;
    // Não repete em cima de um lembrete fixo enviado há menos de 45 min.
    const desde = new Date((corpo.agora ? new Date(corpo.agora) : new Date()).getTime() - 45 * 60_000).toISOString();
    const { count: recente } = await admin.from("notification_log").select("id", { count: "exact", head: true })
      .eq("user_id", p.user_id).eq("tipo", "agendado").eq("status", "enviado").gte("criado_em", desde);
    try {
      const msg = recente ? null : await montarLembretePeriodico(admin, agora.data, agora.hora, p.user_id);
      if (!msg) {
        await admin.from("notification_log").insert({ user_id: p.user_id, tipo: "periodico", slot_hora: slotHora, data_local: agora.data, status: "sem_pendencias", erro: "lembrete fixo enviado há pouco" });
        relatorio.push({ usuario: p.user_id, hora: slot, periodico: true, resultado: "pulado: lembrete fixo recente" });
        continue;
      }
      const r = await enviarParaUsuario(admin, msg, { tipo: "periodico", userId: p.user_id, dataLocal: agora.data, slotHora });
      relatorio.push({ usuario: p.user_id, hora: slot, periodico: true, resultado: r });
    } catch (e) {
      await admin.from("notification_log").insert({ user_id: p.user_id, tipo: "periodico", slot_hora: slotHora, data_local: agora.data, status: "erro", erro: (e as Error).message });
      relatorio.push({ usuario: p.user_id, hora: slot, periodico: true, erro: (e as Error).message });
    }
  }
  return json({ agora, processados: relatorio.length, relatorio });
});
