import { semanaParaPlanejar, somarDias } from "@motor";
import { carregarChecks, carregarContexto, linhaParaRecorrencia } from "@/lib/dados";
import { dataDaPagina } from "@/lib/data-da-pagina";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TelaSemana } from "@/components/semana/tela-semana";

export default async function SemanaPage({ searchParams }: PageProps<"/semana">) {
  const { data: hoje } = dataDaPagina((await searchParams).data);
  const { de, ate } = semanaParaPlanejar(hoje);
  const sb = await criarClienteServidor();
  const [ctx, checks, tarefas, recorrentes, perfil] = await Promise.all([
    carregarContexto(sb),
    carregarChecks(sb, somarDias(hoje, -6), hoje),
    sb.from("tarefas").select("id, titulo, data, hora, prioridade, concluida_em, recorrente_id").gte("data", de).lte("data", ate).order("hora", { nullsFirst: false }),
    sb.from("tarefas_recorrentes").select("*").eq("ativa", true),
    sb.from("profiles").select("foco_habito_id, foco_semana").maybeSingle(),
  ]);
  return (
    <TelaSemana ctx={ctx} checks={checks} hoje={hoje} de={de} ate={ate}
      tarefas={(tarefas.data ?? []).map((t) => ({ id: t.id, titulo: t.titulo, data: t.data, hora: t.hora?.slice(0, 5) ?? null, prioridade: t.prioridade, concluida: !!t.concluida_em, recorrente: !!t.recorrente_id }))}
      recorrentes={(recorrentes.data ?? []).map(linhaParaRecorrencia)}
      focoAtual={perfil.data?.foco_semana === de ? perfil.data.foco_habito_id : null} />
  );
}
