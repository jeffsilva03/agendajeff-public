import { dataDaPagina } from "@/lib/data-da-pagina";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TelaCandidaturas, type Candidatura } from "@/components/candidaturas/tela-candidaturas";

export default async function CandidaturasPage({ searchParams }: PageProps<"/candidaturas">) {
  const { data: hoje } = dataDaPagina((await searchParams).data);
  const sb = await criarClienteServidor();
  const { data } = await sb.from("candidaturas").select("*").order("data_envio", { ascending: false });
  return <TelaCandidaturas candidaturas={(data ?? []) as Candidatura[]} hoje={hoje} />;
}
