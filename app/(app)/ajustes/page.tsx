import { criarClienteServidor } from "@/lib/supabase/server";
import { TelaAjustes } from "@/components/ajustes/tela-ajustes";

export default async function AjustesPage() {
  const sb = await criarClienteServidor();
  const [{ data: { user } }, aparelhos, horarios, registros, perfil, usos, frases] = await Promise.all([
    sb.auth.getUser(),
    sb.from("push_subscriptions").select("id, rotulo, endpoint, criado_em, ultimo_uso").order("criado_em"),
    sb.from("reminder_slots").select("id, hora, ativo").order("hora"),
    sb.from("notification_log").select("*").order("criado_em", { ascending: false }).limit(40),
    sb.from("profiles").select("token_calendario, integracoes_ativas, periodico_ativo, periodico_intervalo, periodico_inicio, periodico_fim, widget_token_criado").maybeSingle(),
    sb.from("api_clientes_uso").select("cliente, ultimo_uso, total"),
    sb.from("frases").select("id, texto").order("criado_em"),
  ]);
  const p = perfil.data;
  return <TelaAjustes email={user?.email ?? ""} aparelhos={aparelhos.data ?? []} horarios={horarios.data ?? []} registros={registros.data ?? []} tokenCalendario={perfil.data?.token_calendario ?? null}
    integracoesAtivas={p?.integracoes_ativas ?? false} usosIntegracao={usos.data ?? []}
    periodico={{ ativo: p?.periodico_ativo ?? false, intervalo: p?.periodico_intervalo ?? 120, inicio: p?.periodico_inicio?.slice(0, 5) ?? "08:00", fim: p?.periodico_fim?.slice(0, 5) ?? "22:00" }}
    frases={frases.data ?? []} widgetTokenCriado={p?.widget_token_criado ?? null} />;
}
