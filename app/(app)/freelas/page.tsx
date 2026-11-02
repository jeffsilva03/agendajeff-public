import { dataDaPagina } from "@/lib/data-da-pagina";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TelaFreelas } from "@/components/freelas/tela-freelas";

export default async function FreelasPage({ searchParams }: PageProps<"/freelas">) {
  const { data: hoje } = dataDaPagina((await searchParams).data);
  const sb = await criarClienteServidor();
  const [freelas, registros] = await Promise.all([
    sb.from("freelas").select("*").order("criado_em"),
    sb.from("freela_time_logs").select("id, freela_id, data_local, horas, nota"),
  ]);
  return <TelaFreelas freelas={freelas.data ?? []} registros={registros.data ?? []} hoje={hoje} />;
}
