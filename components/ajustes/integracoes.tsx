"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Plug, Unplug, X } from "lucide-react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { DADOS_COMPARTILHAVEIS, NUNCA_COMPARTILHADO, caminhosIntegracao } from "@/lib/integracoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export interface UsoCliente { cliente: string; ultimo_uso: string; total: number }
interface Concessao { clientId: string; nome: string; site: string | null; escopos: string[]; desde: string }

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Interruptor, apps conectados (com revogação e último uso) e como conectar. Nada é ligado sozinho. */
export function Integracoes({ ativasIniciais, usos }: { ativasIniciais: boolean; usos: UsoCliente[] }) {
  const sb = useMemo(() => criarClienteNavegador(), []);
  const [ativas, setAtivas] = useState(ativasIniciais);
  const [concessoes, setConcessoes] = useState<Concessao[] | null>(null);
  const [servidorOAuth, setServidorOAuth] = useState<boolean | null>(null);
  const [origem, setOrigem] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await sb.auth.oauth.listGrants();
    if (error) { setServidorOAuth(false); setConcessoes([]); return; }
    setServidorOAuth(true);
    setConcessoes((data ?? []).map((g) => ({ clientId: g.client.id, nome: g.client.name || "Aplicativo sem nome", site: g.client.uri || null, escopos: g.scopes, desde: g.granted_at })));
  }, [sb]);
  useEffect(() => {
    const t = setTimeout(() => { setOrigem(window.location.origin); carregar(); }, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  async function alternar(valor: boolean) {
    setOcupado(true);
    const { error } = await sb.from("profiles").update({ integracoes_ativas: valor }).not("user_id", "is", null);
    setOcupado(false);
    if (error) return toast.error("Não foi possível salvar.");
    setAtivas(valor);
    toast.success(valor ? "Integrações externas ligadas." : "Integrações externas desligadas. Apps conectados não conseguem mais consultar.");
  }

  async function revogar(c: Concessao) {
    if (!confirm(`Revogar o acesso de ${c.nome}? Ele deixa de consultar sua agenda na hora.`)) return;
    setOcupado(true);
    const { error } = await sb.auth.oauth.revokeGrant({ clientId: c.clientId });
    setOcupado(false);
    if (error) return toast.error("Não foi possível revogar. Tente de novo.");
    toast.success(`Acesso de ${c.nome} revogado.`);
    carregar();
  }

  const uso = new Map(usos.map((u) => [u.cliente, u]));
  const { mcp } = caminhosIntegracao(origem);
  const copiar = (texto: string) => navigator.clipboard.writeText(texto).then(() => toast.success("Copiado."), () => toast.error("Não foi possível copiar."));

  return (
    <>
      <label className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
        <span className="text-sm">
          <span className="block font-medium">Permitir integrações externas</span>
          <span className="text-muted-foreground">Permita que aplicativos autorizados consultem informações da sua agenda. Eles não poderão modificar seus registros.</span>
        </span>
        <Switch checked={ativas} disabled={ocupado} onCheckedChange={alternar} aria-label="Permitir integrações externas" />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">Podem consultar</p>
          <ul className="mt-2 space-y-1">
            {DADOS_COMPARTILHAVEIS.map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-feito" aria-hidden />{t}</li>)}
          </ul>
        </div>
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">Nunca</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {NUNCA_COMPARTILHADO.map((t) => <li key={t} className="flex gap-2"><X className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t}</li>)}
          </ul>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Aplicativos conectados</p>
        {concessoes === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : servidorOAuth === false ? (
          <p className="rounded-lg border px-3 py-2.5 text-sm text-muted-foreground">O servidor de autorização ainda não está habilitado neste ambiente. Nenhum aplicativo externo consegue se conectar.</p>
        ) : concessoes.length === 0 ? (
          <p className="rounded-lg border px-3 py-2.5 text-sm text-muted-foreground">Nenhum aplicativo conectado.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {concessoes.map((c) => {
              const u = uso.get(c.clientId);
              return (
                <li key={c.clientId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <Plug className="size-4 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      Autorizado em {dataHora(c.desde)}
                      {u ? ` · último uso ${dataHora(u.ultimo_uso)} (${u.total} ${u.total === 1 ? "consulta" : "consultas"})` : " · ainda não consultou"}
                      {!ativas && " · bloqueado enquanto as integrações estiverem desligadas"}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => revogar(c)} className="text-destructive hover:text-destructive">
                    <Unplug className="size-4" /> Revogar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium">Como conectar</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Ligue o interruptor acima.</li>
          <li>No aplicativo (ex.: ChatGPT, em conectores ou apps no modo desenvolvedor), adicione um servidor MCP com o endereço abaixo e autenticação OAuth.</li>
          <li>Entre com sua conta do AgendaJeff e toque em <strong className="text-foreground">Permitir</strong>.</li>
        </ol>
        {origem && (
          <div className="mt-3 flex gap-2">
            <Input readOnly value={mcp} aria-label="Endereço do servidor MCP" className="numeros font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" size="sm" className="h-9" onClick={() => copiar(mcp)}><Copy className="size-4" /> Copiar</Button>
          </div>
        )}
      </div>
    </>
  );
}
