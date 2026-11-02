import { notFound } from "next/navigation";
import { dataDaPagina } from "@/lib/data-da-pagina";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Feature, Projeto } from "@/lib/projetos";
import { DetalheProjeto } from "@/components/projetos/detalhe-projeto";

export default async function ProjetoPage({ params, searchParams }: PageProps<"/projetos/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: hoje } = dataDaPagina((await searchParams).data);
  const sb = await criarClienteServidor();
  const [projeto, features] = await Promise.all([
    sb.from("projetos").select("*").eq("id", id).maybeSingle(),
    sb.from("projeto_features").select("id, projeto_id, titulo, descricao, status, prioridade, ordem, concluida_em").eq("projeto_id", id),
  ]);
  if (projeto.error || features.error) throw new Error(`Falha ao carregar o projeto: ${(projeto.error ?? features.error)!.message}`);
  if (!projeto.data) notFound();
  return <DetalheProjeto key={id} projeto={projeto.data as Projeto} features={(features.data ?? []) as Feature[]} hoje={hoje} />;
}
