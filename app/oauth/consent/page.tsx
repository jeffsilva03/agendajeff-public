"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck, X } from "lucide-react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { DADOS_COMPARTILHAVEIS, NUNCA_COMPARTILHADO } from "@/lib/integracoes";
import { Button } from "@/components/ui/button";

interface Detalhes { authorizationId: string; cliente: string; site: string | null; retorno: string; escopos: string[] }
type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "desligada"; detalhes: Detalhes }
  | { tipo: "pedido"; detalhes: Detalhes };

/**
 * Tela de consentimento do servidor OAuth do Supabase (Authentication → OAuth Server → Authorization Path).
 * Chega aqui com ?authorization_id=… depois do login. Nada é liberado sem o toque em "Permitir".
 */
export default function ConsentimentoPage() {
  const sb = criarClienteNavegador();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      const authorizationId = new URLSearchParams(window.location.search).get("authorization_id");
      if (!authorizationId) return setEstado({ tipo: "erro", mensagem: "Pedido de autorização inválido: falta o identificador." });
      const { data, error } = await sb.auth.oauth.getAuthorizationDetails(authorizationId);
      if (error || !data) return setEstado({ tipo: "erro", mensagem: "Este pedido de autorização expirou ou não é válido. Volte ao aplicativo e tente conectar de novo." });
      // Já autorizado antes: o Supabase devolve direto o endereço de retorno.
      if (!("authorization_id" in data)) { window.location.assign(data.redirect_url); return; }
      const { data: perfil } = await sb.from("profiles").select("integracoes_ativas").maybeSingle();
      const detalhes: Detalhes = {
        authorizationId: data.authorization_id,
        cliente: data.client.name || "Aplicativo sem nome",
        site: data.client.uri || null,
        retorno: (() => { try { return new URL(data.redirect_uri).host; } catch { return data.redirect_uri; } })(),
        escopos: (data.scope ?? "").split(" ").filter(Boolean),
      };
      setEstado({ tipo: perfil?.integracoes_ativas ? "pedido" : "desligada", detalhes });
    })();
  }, [sb]);

  async function decidir(permitir: boolean, d: Detalhes) {
    setOcupado(true);
    const { data, error } = permitir
      ? await sb.auth.oauth.approveAuthorization(d.authorizationId, { skipBrowserRedirect: true })
      : await sb.auth.oauth.denyAuthorization(d.authorizationId, { skipBrowserRedirect: true });
    if (error || !data) { setOcupado(false); return setEstado({ tipo: "erro", mensagem: "Não foi possível registrar sua resposta. Tente conectar de novo pelo aplicativo." }); }
    window.location.assign(data.redirect_url);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <span aria-hidden className="mb-8 grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
        <ShieldCheck className="size-5" />
      </span>
      {estado.tipo === "carregando" && <p role="status" className="text-muted-foreground">Carregando o pedido de autorização…</p>}
      {estado.tipo === "erro" && (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Não deu para autorizar</h1>
          <p role="alert" className="mt-2 text-muted-foreground">{estado.mensagem}</p>
          <Link href="/hoje" className="mt-6 text-sm underline underline-offset-4">Voltar para o app</Link>
        </>
      )}
      {(estado.tipo === "pedido" || estado.tipo === "desligada") && (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{estado.detalhes.cliente} quer consultar sua agenda</h1>
          <p className="mt-2 text-muted-foreground">
            {estado.detalhes.site ? <>Aplicativo de {estado.detalhes.site}. </> : null}
            Ele vai poder <strong className="text-foreground">ler</strong> informações do AgendaJeff para responder às suas perguntas. Não vai poder modificar seus registros.
          </p>

          <p className="mt-3 text-sm text-muted-foreground">
            O acesso será devolvido para <strong className="text-foreground">{estado.detalhes.retorno}</strong>. Se você não iniciou esta conexão ou não reconhece esse endereço, negue.
          </p>

          <section aria-label="O que poderá ser consultado" className="mt-6 rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Poderá consultar</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {DADOS_COMPARTILHAVEIS.map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-feito" aria-hidden />{t}</li>)}
            </ul>
            <h2 className="mt-4 text-sm font-semibold">Nunca</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {NUNCA_COMPARTILHADO.map((t) => <li key={t} className="flex gap-2"><X className="mt-0.5 size-4 shrink-0" aria-hidden />{t}</li>)}
            </ul>
            {estado.detalhes.escopos.length > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Escopos pedidos ao login: {estado.detalhes.escopos.join(", ")}.
                {estado.detalhes.escopos.some((e) => e === "email" || e === "profile") && " Com eles, o aplicativo também recebe o e-mail da sua conta para identificar quem conectou."}
              </p>
            )}
          </section>

          {estado.tipo === "desligada" ? (
            <div className="mt-6 space-y-3">
              <p role="alert" className="rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm">
                As integrações externas estão desligadas. Ligue em <Link href="/ajustes#integracoes" className="font-medium underline underline-offset-2">Ajustes → Integrações externas</Link> e conecte de novo pelo aplicativo.
              </p>
              <Button variant="outline" className="h-11 w-full" disabled={ocupado} onClick={() => decidir(false, estado.detalhes)}>Recusar este pedido</Button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11" disabled={ocupado} onClick={() => decidir(false, estado.detalhes)}>Negar</Button>
              <Button className="h-11" disabled={ocupado} onClick={() => decidir(true, estado.detalhes)}>Permitir</Button>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Você pode revogar este acesso a qualquer momento em Ajustes → Integrações externas.</p>
        </>
      )}
    </main>
  );
}
