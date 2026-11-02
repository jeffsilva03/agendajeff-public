import { carregarChecks, carregarContexto } from "@/lib/dados";
import { dataDaPagina } from "@/lib/data-da-pagina";
import { criarClienteServidor } from "@/lib/supabase/server";
import { fimDoMes, inicioDoMes, somarMeses } from "@motor";
import { TelaMes, type Aba, type DadosMes } from "@/components/mes/tela-mes";

/** Mês pedido em ?mes=AAAA-MM (até 2 anos para cada lado); senão, o mês de hoje. */
function mesEscolhido(param: string | string[] | undefined, hoje: string) {
  const atual = inicioDoMes(hoje);
  if (typeof param !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(param)) return atual;
  const mes = `${param}-01`;
  return mes >= somarMeses(atual, -24) && mes <= somarMeses(atual, 24) ? mes : atual;
}

export default async function MesPage({ searchParams }: PageProps<"/mes">) {
  const sp = await searchParams;
  const { data: hoje } = dataDaPagina(sp.data);
  const mes = mesEscolhido(sp.mes, hoje);
  const anterior = somarMeses(mes, -1);
  const fim = fimDoMes(mes);
  const aba: Aba = sp.aba === "raiox" || sp.aba === "revisao" ? sp.aba : "metas";
  const sb = await criarClienteServidor();
  const ctx = await carregarContexto(sb);
  const deChecks = ctx.inicioRastreamento && ctx.inicioRastreamento < mes ? mes : (ctx.inicioRastreamento ?? mes);
  const ateChecks = fim < hoje ? fim : hoje;
  const [areas, notas, raioxMes, metas, revisao, checks, tarefas, horas, candidaturas, avaliacoes, focos] = await Promise.all([
    sb.from("raiox_areas").select("id, nome, ordem").order("ordem"),
    sb.from("raiox_notas").select("mes, area_id, importancia, acao, valor, compromisso, foco, meta_acao, como_medir").in("mes", [mes, anterior]),
    sb.from("raiox_meses").select("o_que_sai, checkin").eq("mes", mes).maybeSingle(),
    sb.from("metas").select("id, mes, titulo, tipo, alvo, progresso, unidade, habit_id, area_id, como_medir, concluida_em, origem").eq("mes", mes).order("ordem").order("criado_em"),
    sb.from("revisoes_mensais").select("nota, funcionou, nao_funcionou, aprendi, foco_proximo").eq("mes", mes).maybeSingle(),
    deChecks <= ateChecks ? carregarChecks(sb, deChecks, ateChecks) : Promise.resolve([]),
    sb.from("tarefas").select("id, concluida_em").gte("data", mes).lte("data", fim),
    sb.from("freela_time_logs").select("horas").gte("data_local", mes).lte("data_local", fim),
    sb.from("candidaturas").select("id, status").gte("data_envio", mes).lte("data_envio", fim),
    sb.from("avaliacoes").select("id, tipo, titulo, data, entregue, nota, disciplinas(nome)").gte("data", mes).lte("data", fim).order("data"),
    sb.from("focos").select("minutos").gte("data_local", mes).lte("data_local", fim),
  ]);
  for (const r of [areas, notas, raioxMes, metas, revisao, tarefas, horas, candidaturas, avaliacoes, focos])
    if (r.error) throw new Error(`Falha ao carregar o mês: ${r.error.message}`);

  const dados: DadosMes = {
    hoje, mes, aba, ctx, checks,
    areas: areas.data ?? [],
    notas: (notas.data ?? []).map((n) => ({ ...n })),
    raioxMes: raioxMes.data ?? null,
    metas: (metas.data ?? []).map((m) => ({
      id: m.id, mes: m.mes, titulo: m.titulo, tipo: m.tipo, alvo: m.alvo === null ? null : Number(m.alvo), progresso: Number(m.progresso),
      unidade: m.unidade, habitoId: m.habit_id, areaId: m.area_id, comoMedir: m.como_medir, concluidaEm: m.concluida_em, origem: m.origem,
    })),
    revisao: revisao.data ?? null,
    numeros: {
      tarefas: { total: tarefas.data?.length ?? 0, feitas: (tarefas.data ?? []).filter((t) => t.concluida_em).length },
      horasFreela: (horas.data ?? []).reduce((s, h) => s + Number(h.horas), 0),
      candidaturas: candidaturas.data?.length ?? 0,
      minutosFoco: (focos.data ?? []).reduce((s, f) => s + f.minutos, 0),
      avaliacoes: (avaliacoes.data ?? []).map((a) => ({
        id: a.id, tipo: a.tipo, titulo: a.titulo, data: a.data, entregue: a.entregue, nota: a.nota === null ? null : Number(a.nota),
        disciplina: (a.disciplinas as unknown as { nome: string } | null)?.nome ?? null,
      })),
    },
  };
  return <TelaMes key={`${mes}-${aba}`} {...dados} />;
}
