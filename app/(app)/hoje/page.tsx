import { diasEntre, fimDoMes, inicioDoMes, somarDias, somarMeses, type Meta } from "@motor";
import { carregarChecks, carregarContexto, carregarTarefas } from "@/lib/dados";
import { dataDaPagina } from "@/lib/data-da-pagina";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TelaHoje } from "@/components/hoje/tela-hoje";

/** Dia escolhido nas setas (?dia=AAAA-MM-DD), até um ano para cada lado; qualquer outra coisa volta para hoje. */
function diaEscolhido(param: string | string[] | undefined, hoje: string): string {
  if (typeof param !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return hoje;
  const d = new Date(`${param}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== param) return hoje;
  return Math.abs(diasEntre(hoje, param)) <= 366 ? param : hoje;
}

export default async function HojePage({ searchParams }: PageProps<"/hoje">) {
  const sp = await searchParams;
  const { data: hoje, hora, simulada } = dataDaPagina(sp.data);
  const data = diaEscolhido(sp.dia, hoje);
  const relacao = data === hoje ? "hoje" : data < hoje ? "passado" : "futuro";
  const sb = await criarClienteServidor();
  const ctx = await carregarContexto(sb);
  const inicio = ctx.inicioRastreamento && ctx.inicioRastreamento < data ? ctx.inicioRastreamento : data;
  const mes = inicioDoMes(data);
  // Lembrete do mês: nos 2 últimos dias, a revisão do mês; nos 3 primeiros, a revisão do anterior e o Raio-X do novo.
  const ultimosDias = diasEntre(data, fimDoMes(mes)) <= 1;
  const primeirosDias = Number(data.slice(8)) <= 3;
  const mesRevisao = ultimosDias ? mes : primeirosDias ? somarMeses(mes, -1) : null;
  const [historicoAnterior, checksDia, tarefas, perfil, metas, revisaoFeita, raioxFeito, faltas] = await Promise.all([
    inicio < data ? carregarChecks(sb, inicio, somarDias(data, -1)) : Promise.resolve([]),
    sb.from("checks").select("habit_id, status, nota").eq("data_local", data),
    carregarTarefas(sb, data),
    sb.from("profiles").select("foco_habito_id, foco_semana").maybeSingle(),
    sb.from("metas").select("id, mes, titulo, tipo, alvo, progresso, unidade, habit_id, area_id, como_medir, concluida_em, origem").eq("mes", mes).order("ordem").order("criado_em"),
    mesRevisao ? sb.from("revisoes_mensais").select("id", { count: "exact", head: true }).eq("mes", mesRevisao) : Promise.resolve({ count: 1 }),
    primeirosDias ? sb.from("raiox_notas").select("id", { count: "exact", head: true }).eq("mes", mes) : Promise.resolve({ count: 1 }),
    sb.from("faltas").select("id, data, disciplina_id, motivo, evento_id").eq("data", data),
  ]);
  const metasDoMes: Meta[] = (metas.data ?? []).map((m) => ({
    id: m.id, mes: m.mes, titulo: m.titulo, tipo: m.tipo, alvo: m.alvo === null ? null : Number(m.alvo), progresso: Number(m.progresso),
    unidade: m.unidade, habitoId: m.habit_id, areaId: m.area_id, comoMedir: m.como_medir, concluidaEm: m.concluida_em, origem: m.origem,
  }));
  const lembreteMes = relacao !== "hoje" ? null
    : mesRevisao && !revisaoFeita.count ? { texto: `Revisão de ${new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(`${mesRevisao}T12:00:00Z`))}`, detalhe: "números do mês, metas e uma reflexão rápida", href: `/mes?aba=revisao${mesRevisao !== mes ? `&mes=${mesRevisao.slice(0, 7)}` : ""}` }
    : primeirosDias && !raioxFeito.count ? { texto: "Raio-X da vida do novo mês", detalhe: "notas das áreas e o foco do mês", href: "/mes?aba=raiox" }
    : null;
  const focoSemana = perfil.data?.foco_habito_id && perfil.data.foco_semana ? { habitoId: perfil.data.foco_habito_id, semana: perfil.data.foco_semana } : null;
  const checksIniciais = (checksDia.data ?? []).map((c) => ({ habitoId: c.habit_id, data, status: c.status, nota: c.nota }));
  // Num dia futuro, só as tarefas daquele dia (as abertas de hoje continuam aparecendo em hoje, não são "do futuro").
  const tarefasDoDia = relacao === "futuro" ? tarefas.filter((t) => t.data === data) : tarefas;
  return (
    <TelaHoje key={data} ctx={ctx} data={data} hoje={hoje} relacao={relacao} checksIniciais={checksIniciais} historicoAnterior={historicoAnterior}
      tarefasIniciais={tarefasDoDia} focoSemana={focoSemana} horaAgora={relacao === "hoje" ? hora : null} simulada={simulada}
      metas={metasDoMes} lembreteMes={lembreteMes} faltas={faltas.data ?? []} />
  );
}
