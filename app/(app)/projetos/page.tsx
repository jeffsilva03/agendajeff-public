import { dataDaPagina } from "@/lib/data-da-pagina";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Feature, Projeto } from "@/lib/projetos";
import { TelaProjetos } from "@/components/projetos/tela-projetos";

export default async function ProjetosPage({ searchParams }: PageProps<"/projetos">) {
  const { data: hoje } = dataDaPagina((await searchParams).data);
  const sb = await criarClienteServidor();
  const [projetos, features] = await Promise.all([
    sb.from("projetos").select("*"),
    sb.from("projeto_features").select("projeto_id, status, prioridade"),
  ]);
  for (const r of [projetos, features]) if (r.error) throw new Error(`Falha ao carregar projetos: ${r.error.message}`);
  return <TelaProjetos projetos={(projetos.data ?? []) as Projeto[]} features={(features.data ?? []) as Pick<Feature, "projeto_id" | "status" | "prioridade">[]} hoje={hoje} />;
}
