import { carregarChecks, carregarContexto } from "@/lib/dados";
import { dataDaPagina } from "@/lib/data-da-pagina";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TelaHabitos } from "@/components/habitos/tela-habitos";

export default async function HabitosPage({ searchParams }: PageProps<"/habitos">) {
  const { data: hoje } = dataDaPagina((await searchParams).data);
  const sb = await criarClienteServidor();
  const ctx = await carregarContexto(sb);
  const [checks, notas] = await Promise.all([
    carregarChecks(sb, ctx.inicioRastreamento ?? hoje, hoje),
    sb.from("checks").select("habit_id, data_local, status, nota").not("nota", "is", null).order("data_local", { ascending: false }).limit(200),
  ]);
  const listaNotas = (notas.data ?? []).map((n) => ({ habitoId: n.habit_id, data: n.data_local, status: n.status, nota: n.nota as string }));
  return <TelaHabitos ctx={ctx} checks={checks} notas={listaNotas} hoje={hoje} />;
}
