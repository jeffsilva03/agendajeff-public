import { somarDias } from "@motor";
import { carregarChecks, carregarContexto } from "@/lib/dados";
import { dataDaPagina } from "@/lib/data-da-pagina";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TelaInsights } from "@/components/insights/tela-insights";

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const { data: hoje, hora } = dataDaPagina((await searchParams).data);
  const sb = await criarClienteServidor();
  const ctx = await carregarContexto(sb);
  const [checks, focos] = await Promise.all([
    carregarChecks(sb, ctx.inicioRastreamento ?? hoje, hoje),
    sb.from("focos").select("data_local, minutos").gte("data_local", somarDias(hoje, -62)),
  ]);
  return <TelaInsights ctx={ctx} checks={checks} hoje={hoje} horaAgora={hora} focos={(focos.data ?? []).map((f) => ({ data: f.data_local, minutos: f.minutos }))} />;
}
