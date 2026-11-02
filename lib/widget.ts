// Resumo compacto do dia para os widgets (iPhone via Scriptable, Windows via Widgets Board).
// As contas são as mesmas do Hoje e das metas (motor); aqui só se escolhe o que cabe num widget.
import {
  blocoDaVez, fraseDoMomento, horaCurta, inicioDoMes, minutos, progressoHabitos, progressoMeta, resolverDia, somarDias,
  type Meta, type StatusCheck,
} from "@motor";
import { carregarChecks, carregarContexto, carregarTarefas } from "@/lib/dados";
import { dataCurta } from "@/lib/apresentacao";

type Cliente = Parameters<typeof carregarContexto>[0];

export interface ResumoWidget {
  data: string;
  dia: string; // "Seg, 19 out"
  atualizado: string; // "HH:MM"
  semAula: string | null;
  habitos: { feitos: number; total: number; pct: number; texto: string };
  proximo: { nome: string; grupo: string } | null;
  tarefas: { titulo: string; hora: string | null; importante: boolean }[];
  tarefasTotal: number;
  agenda: { hora: string; titulo: string }[];
  sequencia: { nome: string; dias: number } | null;
  metas: { titulo: string; pct: number | null; texto: string }[];
  frase: string;
}

/** Monta o resumo de `data` às `hora`. Com `userId`, o cliente é privilegiado e filtra por usuário; sem, usa a RLS. */
export async function montarResumoWidget(sb: Cliente, data: string, hora: string, userId?: string): Promise<ResumoWidget> {
  const ctx = await carregarContexto(sb, userId);
  const inicio = ctx.inicioRastreamento && ctx.inicioRastreamento > somarDias(data, -90) ? ctx.inicioRastreamento : somarDias(data, -90);
  let qMetas = sb.from("metas").select("id, mes, titulo, tipo, alvo, progresso, unidade, habit_id, area_id, como_medir, concluida_em, origem").eq("mes", inicioDoMes(data)).order("ordem");
  if (userId) qMetas = qMetas.eq("user_id", userId);
  const [checks, tarefas, metasR] = await Promise.all([
    carregarChecks(sb, inicio <= data ? inicio : data, data, userId),
    carregarTarefas(sb, data, userId),
    qMetas,
  ]);
  if (metasR.error) throw new Error(`metas: ${metasR.error.message}`);

  const dia = resolverDia(data, ctx);
  const nome = new Map(ctx.habitos.map((h) => [h.id, h.nome]));
  const hoje = new Map(checks.filter((c) => c.data === data).map((c) => [c.habitoId, c.status as StatusCheck]));
  const valem = [...dia.cadeias.flatMap((c) => c.passos.map((p) => p.habitoId)), ...dia.flexiveis.map((h) => h.id)];
  const feitos = valem.filter((id) => hoje.get(id) === "completo" || hoje.get(id) === "minimo").length;
  const vez = blocoDaVez(dia, (id) => hoje.get(id), hora);
  const cadeia = vez?.tipo === "cadeia" ? dia.cadeias.find((c) => c.id === vez.cadeiaId) : undefined;
  const proximoId = cadeia ? cadeia.passos.find((p) => !hoje.get(p.habitoId))?.habitoId : vez?.tipo === "flexiveis" ? dia.flexiveis.find((h) => !hoje.get(h.id))?.id : undefined;

  const pendentes = tarefas.filter((t) => !t.concluidaEm).sort((a, b) => b.prioridade - a.prioridade || (a.hora ?? "99").localeCompare(b.hora ?? "99"));
  const agora = minutos(hora);
  const agenda = [
    ...dia.aulas.map((a) => ({ inicio: a.inicio, titulo: a.disciplina })),
    ...dia.compromissos.filter((e) => e.inicio).map((e) => ({ inicio: e.inicio!, titulo: e.titulo })),
  ].filter((x) => minutos(x.inicio) >= agora - 30).sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 3)
    .map((x) => ({ hora: horaCurta(x.inicio), titulo: x.titulo }));

  const progresso = progressoHabitos(ctx, checks, data);
  const maior = progresso.maiorSequencia && progresso.maiorSequencia.resumo.sequenciaAtual >= 2
    ? { nome: progresso.maiorSequencia.nome, dias: progresso.maiorSequencia.resumo.sequenciaAtual } : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linha crua do PostgREST
  const metas: Meta[] = (metasR.data ?? []).map((m: any) => ({
    id: m.id, mes: m.mes, titulo: m.titulo, tipo: m.tipo, alvo: m.alvo === null ? null : Number(m.alvo), progresso: Number(m.progresso),
    unidade: m.unidade, habitoId: m.habit_id, areaId: m.area_id, comoMedir: m.como_medir, concluidaEm: m.concluida_em, origem: m.origem,
  }));
  const comProgresso = metas.map((m) => ({ m, p: progressoMeta(m, checks, data) }));
  const atrasada = comProgresso.find((x) => x.p.situacao === "atras");

  return {
    data,
    dia: dataCurta(data),
    atualizado: hora,
    semAula: dia.motivoSemAula,
    habitos: { feitos, total: valem.length, pct: valem.length ? feitos / valem.length : 0, texto: `${feitos}/${valem.length} hábitos` },
    proximo: proximoId ? { nome: nome.get(proximoId) ?? "", grupo: cadeia?.nome ?? "Flexíveis" } : null,
    tarefas: pendentes.slice(0, 5).map((t) => ({ titulo: t.titulo, hora: t.hora ? horaCurta(t.hora) : null, importante: t.prioridade === 1 })),
    tarefasTotal: pendentes.length,
    agenda,
    sequencia: maior,
    metas: comProgresso.slice(0, 3).map(({ m, p }) => ({
      titulo: m.titulo,
      pct: m.tipo === "marco" ? null : p.pct, // marco é feito ou não: sem barra
      texto: m.tipo === "marco" ? (p.situacao === "concluida" ? "feito" : "a fazer") : p.alvo !== null ? `${p.atual}/${p.alvo}` : String(p.atual),
    })),
    frase: fraseDoMomento({
      hora, pendentes: valem.length - feitos + pendentes.length, sequencia: maior, proximoHabito: proximoId ? nome.get(proximoId) ?? null : null,
      meta: atrasada && atrasada.p.alvo !== null ? { titulo: atrasada.m.titulo, falta: atrasada.p.alvo - atrasada.p.atual, unidade: atrasada.m.unidade } : null,
    }, `${data}|${hora.slice(0, 2)}`),
  };
}

/** Hash SHA-256 (hex) do token do widget: só o hash fica no banco. */
export async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Formato plano para o template Adaptive Card do Windows (strings prontas, listas com no máximo 4 itens). */
export function paraAdaptiveCard(r: ResumoWidget, url: string) {
  return {
    titulo: `${r.dia}${r.semAula ? " · sem aula" : ""}`,
    habitos: r.habitos.texto,
    barra: `${Math.round(r.habitos.pct * 100)}%`,
    proximo: r.proximo ? `Próximo: ${r.proximo.nome}` : r.habitos.total ? "Hábitos do dia registrados" : "Sem hábitos hoje",
    tarefasTitulo: r.tarefasTotal ? `Tarefas (${r.tarefasTotal})` : "Tarefas",
    tarefas: (r.tarefas.length ? r.tarefas.slice(0, 4) : [{ titulo: "Nenhuma pendente", hora: null, importante: false }])
      .map((t) => ({ texto: `${t.importante ? "! " : ""}${t.titulo}${t.hora ? ` · ${t.hora}` : ""}` })),
    agenda: (r.agenda.length ? r.agenda : [{ hora: "", titulo: "Nada mais na agenda hoje" }]).map((a) => ({ texto: a.hora ? `${a.hora}  ${a.titulo}` : a.titulo })),
    sequencia: r.sequencia ? `${r.sequencia.dias} dias seguidos de ${r.sequencia.nome}` : "",
    metas: r.metas.map((m) => ({ texto: `${m.titulo}: ${m.texto}` })),
    temMetas: r.metas.length > 0,
    frase: r.frase,
    atualizado: `Atualizado às ${horaCurta(r.atualizado)}`,
    url,
  };
}
