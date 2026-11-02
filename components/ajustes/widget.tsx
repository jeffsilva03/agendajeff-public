"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Monitor, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { scriptDoWidget } from "@/lib/widget-scriptable";
import type { ResumoWidget } from "@/lib/widget";
import { PreviaWidget } from "./previa-widget";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Token aleatório de 256 bits (base64url) com prefixo; só o hash SHA-256 vai para o banco. */
async function novoToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `wjt_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { token, hash };
}

export function SecaoWidget({ tokenCriadoEm }: { tokenCriadoEm: string | null }) {
  const sb = useMemo(() => criarClienteNavegador(), []);
  const [criado, setCriado] = useState(tokenCriadoEm);
  const [script, setScript] = useState<string | null>(null);
  const [previa, setPrevia] = useState<ResumoWidget | null>(null);

  async function gerar() {
    if (criado && !confirm("Gerar um novo token desliga o widget que já está no iPhone até você colar o script novo. Continuar?")) return;
    const { token, hash } = await novoToken();
    const agora = new Date().toISOString();
    const { error } = await sb.from("profiles").update({ widget_token_hash: hash, widget_token_criado: agora }).not("user_id", "is", null);
    if (error) return toast.error("Não foi possível gerar o token.");
    setCriado(agora);
    setScript(scriptDoWidget(window.location.origin, token));
    toast.success("Script gerado. Copie agora: o token não aparece de novo.");
  }

  async function revogar() {
    if (!confirm("Revogar o token? O widget do iPhone para de atualizar.")) return;
    const { error } = await sb.from("profiles").update({ widget_token_hash: null, widget_token_criado: null }).not("user_id", "is", null);
    if (error) return toast.error("Não foi possível revogar.");
    setCriado(null);
    setScript(null);
    toast.success("Token revogado.");
  }

  async function verPrevia() {
    const r = await fetch("/api/widget", { cache: "no-store" });
    if (!r.ok) return toast.error("Não foi possível carregar o resumo.");
    setPrevia(await r.json());
  }

  return (
    <>
      <div className="rounded-lg border p-4 text-sm">
        <p className="flex items-center gap-2 font-medium"><Smartphone className="size-4" aria-hidden /> iPhone (app Scriptable, grátis)</p>
        <p className="mt-1 text-muted-foreground">O iOS não deixa um app web colocar widget na tela inicial. O Scriptable roda um script que busca o resumo do dia e desenha o widget (pequeno, médio ou grande).</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Instale o <strong className="text-foreground">Scriptable</strong> na App Store.</li>
          <li>Toque em <strong className="text-foreground">Gerar script</strong> abaixo e copie.</li>
          <li>No Scriptable, toque em <strong className="text-foreground">+</strong>, cole o script e dê o nome “Cadeia”.</li>
          <li>Na tela inicial, segure, toque em <strong className="text-foreground">+</strong>, escolha <strong className="text-foreground">Scriptable</strong> e o tamanho. Depois, segure o widget → <strong className="text-foreground">Editar widget</strong> → Script: “Cadeia”.</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Quem decide quando o widget atualiza é o iOS: o script pede uma nova busca a cada 5 minutos, mas o iPhone pode esperar mais para poupar bateria. O horário no canto (↻) mostra quando os dados foram buscados.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <KeyRound className="size-3.5" aria-hidden />
          {criado ? `Token ativo desde ${dataHora(criado)}. Só dá para ver o resumo do dia com ele, e você pode revogar quando quiser.` : "Nenhum token ativo."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={gerar}><RefreshCw className="size-4" /> {criado ? "Gerar script novo" : "Gerar script"}</Button>
          {criado && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={revogar}><Trash2 className="size-4" /> Revogar token</Button>}
        </div>
        {script && (
          <div className="mt-3 space-y-2">
            <Textarea readOnly value={script} rows={6} aria-label="Script do widget" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(script).then(() => toast.success("Script copiado."), () => toast.error("Não foi possível copiar; selecione e copie à mão."))}>
              <Copy className="size-4" /> Copiar script
            </Button>
            <p className="text-xs text-aviso">O script tem o seu token: não compartilhe. Se vazar, gere um novo aqui.</p>
          </div>
        )}
      </div>

      <div className="rounded-lg border p-4 text-sm">
        <p className="flex items-center gap-2 font-medium"><Monitor className="size-4" aria-hidden /> PC (painel de Widgets do Windows 11)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Instale o app pelo <strong className="text-foreground">Microsoft Edge</strong> (ícone de instalar na barra de endereço).</li>
          <li>Enquanto a Microsoft libera widgets de apps web só em modo de teste: instale o <strong className="text-foreground">Windows App SDK</strong> e ligue o <strong className="text-foreground">Modo de desenvolvedor</strong> (Configurações → Sistema → Para desenvolvedores).</li>
          <li>Abra o painel com <strong className="text-foreground">Windows + W</strong> → <strong className="text-foreground">Adicionar widgets</strong> → <strong className="text-foreground">Cadeia: hoje</strong>.</li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">O widget usa a sessão do app (fique conectado no Edge) e se atualiza a cada 30 minutos ou quando chega uma notificação.</p>
      </div>

      <div>
        <Button size="sm" variant="outline" onClick={verPrevia}>Ver o que o widget mostra agora</Button>
        {previa && <div className="mt-3"><PreviaWidget d={previa} /></div>}
      </div>
    </>
  );
}
