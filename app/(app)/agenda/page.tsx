import { carregarContexto } from "@/lib/dados";
import { dataDaPagina } from "@/lib/data-da-pagina";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TelaAgenda } from "@/components/agenda/tela-agenda";

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const { data: hoje } = dataDaPagina((await searchParams).data);
  const ctx = await carregarContexto(await criarClienteServidor());
  return <TelaAgenda ctx={ctx} hoje={hoje} />;
}
