"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Bell, BellOff, CalendarSync, Copy, Download, FileDown, LogOut, Plus, RefreshCw, Send, Share, SquarePlus, Trash2, Smartphone, Monitor } from "lucide-react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { ativarPush, desativarPushNesteAparelho, ehIOS, estaInstalado, inscricaoAtual, rotuloPadrao, suportaPush } from "@/lib/push-cliente";
import { removerAparelho, removerHorario, salvarHorario } from "@/lib/mutacoes";
import { diaMes } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Cabecalho } from "@/components/app/cabecalho";
import { Integracoes, type UsoCliente } from "./integracoes";
import { LembretePeriodico, type ConfigPeriodico, type Frase } from "./lembrete-periodico";
import { SecaoWidget } from "./widget";

export interface Aparelho { id: string; rotulo: string; endpoint: string; criado_em: string; ultimo_uso: string | null }
export interface Horario { id: string; hora: string; ativo: boolean }
export interface RegistroEnvio { id: string; tipo: string; slot_hora: string | null; data_local: string; status: string; titulo: string | null; corpo: string | null; erro: string | null; criado_em: string; subscription_id: string | null }

const STATUS: Record<string, { r: string; c: string }> = {
  enviado: { r: "Enviado", c: "text-feito" },
  erro: { r: "Erro", c: "text-destructive" },
  sem_pendencias: { r: "Nada pendente, não enviado", c: "text-muted-foreground" },
  sem_aparelho: { r: "Sem aparelho ativo", c: "text-aviso" },
};

function Secao({ titulo, descricao, id, children }: { titulo: string; descricao?: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 grid gap-4 border-b py-6 last:border-0 md:grid-cols-[16rem_1fr] md:gap-8">
      <div>
        <h2 className="text-[15px] font-semibold">{titulo}</h2>
        {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

export function TelaAjustes({ email, aparelhos, horarios, registros, tokenCalendario, integracoesAtivas, usosIntegracao, periodico, frases, widgetTokenCriado }: { email: string; aparelhos: Aparelho[]; horarios: Horario[]; registros: RegistroEnvio[]; tokenCalendario: string | null; integracoesAtivas: boolean; usosIntegracao: UsoCliente[]; periodico: ConfigPeriodico; frases: Frase[]; widgetTokenCriado: string | null }) {
  const router = useRouter();
  const sb = criarClienteNavegador();
  const { resolvedTheme, setTheme } = useTheme();
  const [ambiente, setAmbiente] = useState<{ ios: boolean; instalado: boolean; suporta: boolean; permissao: string; endpoint: string | null } | null>(null);
  const [rotulo, setRotulo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [novaHora, setNovaHora] = useState("");
  const [origem, setOrigem] = useState("");

  useEffect(() => {
    (async () => {
      const sub = await inscricaoAtual();
      setAmbiente({
        ios: ehIOS(), instalado: estaInstalado(), suporta: suportaPush(),
        permissao: typeof Notification !== "undefined" ? Notification.permission : "indisponível",
        endpoint: sub?.endpoint ?? null,
      });
      setRotulo(rotuloPadrao());
      setOrigem(window.location.origin);
    })();
  }, []);

  async function agir(f: () => Promise<unknown>, ok?: string) {
    setOcupado(true);
    try { await f(); if (ok) toast.success(ok); router.refresh(); } catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
  }

  const ativoAqui = !!ambiente?.endpoint && aparelhos.some((a) => a.endpoint === ambiente.endpoint);
  const precisaInstalar = !!ambiente && ambiente.ios && !ambiente.instalado;
  const nomeAparelho = new Map(aparelhos.map((a) => [a.id, a.rotulo]));

  return (
    <>
      <Cabecalho titulo="Ajustes">Instalação, notificações, horários dos lembretes, integrações e conta.</Cabecalho>
      <div className="max-w-4xl px-4 pb-16 md:px-8">

        <Secao titulo="Instalar o app" descricao="Instalado, ele abre em tela cheia e pode receber notificações. No iPhone, é obrigatório para o push funcionar.">
          {!ambiente ? null : ambiente.instalado ? (
            <p className="rounded-lg border bg-feito/10 px-3 py-2.5 text-sm text-feito">Você está usando o app instalado.</p>
          ) : ambiente.ios ? (
            <ol className="space-y-2.5 rounded-lg border p-4 text-sm">
              <li className="flex gap-3"><span className="numeros text-muted-foreground">1</span><span>Abra este endereço no <strong>Safari</strong>.</span></li>
              <li className="flex gap-3"><span className="numeros text-muted-foreground">2</span><span className="flex flex-wrap items-center gap-1">Toque em <Share className="inline size-4" aria-label="Compartilhar" /> <strong>Compartilhar</strong>.</span></li>
              <li className="flex gap-3"><span className="numeros text-muted-foreground">3</span><span className="flex flex-wrap items-center gap-1">Escolha <SquarePlus className="inline size-4" aria-hidden /> <strong>Adicionar à Tela de Início</strong> e confirme.</span></li>
              <li className="flex gap-3"><span className="numeros text-muted-foreground">4</span><span>Abra o <strong>Cadeia</strong> pelo ícone e volte aqui em Ajustes para ativar as notificações.</span></li>
            </ol>
          ) : (
            <div className="rounded-lg border p-4 text-sm">
              <p className="flex items-center gap-2 font-medium"><Download className="size-4" aria-hidden /> No Edge ou no Chrome</p>
              <p className="mt-1 text-muted-foreground">Clique no ícone de instalar na barra de endereço (ou no menu ⋯ → Aplicativos → Instalar Cadeia). O ícone também mostra quantos itens estão pendentes.</p>
            </div>
          )}
        </Secao>

        <Secao titulo="Notificações neste aparelho" descricao="Lembretes com o que está pendente no período. A permissão só é pedida quando você toca no botão.">
          {!ambiente ? null : !ambiente.suporta && !precisaInstalar ? (
            <p className="text-sm text-muted-foreground">Este navegador não suporta notificações push.</p>
          ) : precisaInstalar ? (
            <p className="rounded-lg border border-aviso/30 bg-aviso/10 px-3 py-2.5 text-sm text-aviso">No iPhone, instale o app (passos acima) e ative as notificações por dentro dele.</p>
          ) : ativoAqui ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-sm text-feito"><Bell className="size-4" aria-hidden /> Ativas neste aparelho</span>
              <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => agir(() => desativarPushNesteAparelho(sb).then(() => setAmbiente((a) => a && { ...a, endpoint: null })), "Notificações desativadas aqui.")}>
                <BellOff className="size-4" /> Desativar aqui
              </Button>
            </div>
          ) : (
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
              e.preventDefault();
              agir(async () => {
                await ativarPush(sb, rotulo);
                const sub = await inscricaoAtual();
                setAmbiente((a) => a && { ...a, endpoint: sub?.endpoint ?? null, permissao: Notification.permission });
              }, "Notificações ativadas.");
            }}>
              <div className="space-y-1.5">
                <Label htmlFor="rotulo" className="text-[13px]">Nome do aparelho</Label>
                <Input id="rotulo" value={rotulo} onChange={(e) => setRotulo(e.target.value)} className="w-56" />
              </div>
              <Button type="submit" disabled={ocupado}><Bell className="size-4" /> Ativar notificações</Button>
              {ambiente.permissao === "denied" && <p className="w-full text-sm text-destructive">As notificações estão bloqueadas para este site. Libere nas configurações do navegador.</p>}
            </form>
          )}

          <div className="pt-2">
            <Button variant="outline" size="sm" disabled={ocupado || aparelhos.length === 0} onClick={() => agir(async () => {
              const { data, error } = await sb.functions.invoke("push-teste");
              if (error) throw new Error(`Falha ao chamar o envio de teste: ${error.message}`);
              const r = (data?.resultados ?? []) as { aparelho: string; ok: boolean; erro?: string }[];
              const falhas = r.filter((x) => !x.ok);
              if (falhas.length) throw new Error(`Falhou em ${falhas.map((f) => `${f.aparelho} (${f.erro})`).join(", ")}`);
              toast.success(`Teste enviado para ${r.map((x) => x.aparelho).join(", ")}.`);
            })}>
              <Send className="size-4" /> Enviar notificação de teste
            </Button>
            {aparelhos.length === 0 && <p className="mt-1.5 text-xs text-muted-foreground">Ative em pelo menos um aparelho para testar.</p>}
          </div>
        </Secao>

        <Secao titulo="Aparelhos" descricao="Recebem os lembretes. Inscrições que expiram são removidas sozinhas.">
          {aparelhos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum aparelho ainda.</p> : (
            <ul className="divide-y rounded-lg border">
              {aparelhos.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                  {/iphone|android|ipad/i.test(a.rotulo) ? <Smartphone className="size-4 text-muted-foreground" aria-hidden /> : <Monitor className="size-4 text-muted-foreground" aria-hidden />}
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{a.rotulo}{a.endpoint === ambiente?.endpoint && <span className="ml-2 text-xs text-muted-foreground">(este)</span>}</span>
                    <span className="text-xs text-muted-foreground">
                      desde {diaMes(a.criado_em.slice(0, 10))}{a.ultimo_uso && `, último envio ${diaMes(a.ultimo_uso.slice(0, 10))}`}
                    </span>
                  </span>
                  <Button variant="ghost" size="icon" aria-label={`Remover ${a.rotulo}`} disabled={ocupado}
                    onClick={() => confirm(`Parar de enviar para ${a.rotulo}?`) && agir(() => removerAparelho(sb, a.id), "Aparelho removido.")}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Horários dos lembretes" descricao="Todos os dias, inclusive fim de semana. Se nada estiver pendente no período, o lembrete não sai. Cadeias com lembretes desativados não aparecem.">
          <ul className="divide-y rounded-lg border">
            {horarios.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-3 py-2">
                <Input type="time" defaultValue={h.hora.slice(0, 5)} aria-label="Horário" className="w-32"
                  onBlur={(e) => e.target.value && e.target.value !== h.hora.slice(0, 5) && agir(() => salvarHorario(sb, e.target.value, h.ativo, h.id), "Horário salvo.")} />
                <span className="flex-1 text-sm text-muted-foreground">
                  {Number(h.hora.slice(0, 2)) < 12 ? "Manhã e prazos" : Number(h.hora.slice(0, 2)) < 18 ? "Tarde e flexíveis" : "Noite e flexíveis"}
                </span>
                <Switch checked={h.ativo} aria-label="Ativo" disabled={ocupado} onCheckedChange={(v) => agir(() => salvarHorario(sb, h.hora.slice(0, 5), v, h.id))} />
                <Button variant="ghost" size="icon" aria-label="Remover horário" disabled={ocupado}
                  onClick={() => agir(() => removerHorario(sb, h.id), "Horário removido.")}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (novaHora) agir(() => salvarHorario(sb, novaHora, true).then(() => setNovaHora("")), "Horário adicionado."); }}>
            <Input type="time" value={novaHora} onChange={(e) => setNovaHora(e.target.value)} aria-label="Novo horário" className="w-32" />
            <Button type="submit" variant="outline" size="sm" disabled={!novaHora || ocupado}><Plus className="size-4" /> Adicionar horário</Button>
          </form>
        </Secao>

        <Secao id="lembrete-periodico" titulo="Lembretes ao longo do dia" descricao="Além dos horários fixos: a cada poucas horas, uma frase motivacional. Começa desligado.">
          <LembretePeriodico inicial={periodico} frasesIniciais={frases} />
        </Secao>

        <Secao id="widget" titulo="Widget na tela inicial" descricao="Hábitos do dia, próximas tarefas, agenda e metas do mês num widget no iPhone e no Windows.">
          <SecaoWidget tokenCriadoEm={widgetTokenCriado} />
        </Secao>

        <Secao titulo="Registro de envios" descricao="Cada disparo, com sucesso ou erro, para você conferir.">
          {registros.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum envio ainda.</p> : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-superficie text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2 font-medium">Quando</th><th className="px-3 py-2 font-medium">Tipo</th><th className="px-3 py-2 font-medium">Aparelho</th><th className="px-3 py-2 font-medium">Resultado</th></tr>
                </thead>
                <tbody className="divide-y">
                  {registros.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="numeros px-3 py-2 whitespace-nowrap">{diaMes(r.data_local)} {new Date(r.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.tipo === "teste" ? "Teste" : `Lembrete ${r.slot_hora?.slice(0, 5)}`}</td>
                      <td className="px-3 py-2">{r.subscription_id ? nomeAparelho.get(r.subscription_id) ?? "removido" : "—"}</td>
                      <td className="px-3 py-2">
                        <span className={cn("font-medium", STATUS[r.status]?.c)}>{STATUS[r.status]?.r ?? r.status}</span>
                        {r.erro && <span className="block text-xs text-muted-foreground">{r.erro}</span>}
                        {r.status === "enviado" && r.corpo && <span className="block max-w-md truncate text-xs text-muted-foreground" title={r.corpo}>{r.corpo.replace(/\n/g, " · ")}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Secao>

        <Secao titulo="Agenda no calendário do celular" descricao="Assine no Calendário do iPhone (ou Google/Outlook): compromissos, dias sem aula e prazos aparecem lá e atualizam sozinhos.">
          {tokenCalendario ? (
            <>
              <div className="flex gap-2">
                <Input readOnly aria-label="Link do calendário" value={origem && `${origem}/calendario/${tokenCalendario}.ics`} className="font-mono text-xs" />
                <Button variant="outline" size="icon" aria-label="Copiar link" onClick={async () => {
                  await navigator.clipboard.writeText(`${origem}/calendario/${tokenCalendario}.ics`);
                  toast.success("Link copiado.");
                }}><Copy className="size-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <a href={origem ? `${origem.replace(/^https?/, "webcal")}/calendario/${tokenCalendario}.ics` : "#"}><CalendarSync className="size-4" /> Assinar no calendário</a>
                </Button>
                <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => {
                  if (!confirm("Gerar um novo link? O link atual para de funcionar em todos os calendários.")) return;
                  agir(async () => {
                    const { error } = await sb.from("profiles").update({ token_calendario: crypto.randomUUID() }).not("user_id", "is", null);
                    if (error) throw new Error(error.message);
                  }, "Novo link gerado. Assine de novo no celular.");
                }}><RefreshCw className="size-4" /> Gerar novo link</Button>
              </div>
              <p className="text-xs text-muted-foreground">Quem tiver o link vê sua agenda. Se ele vazar, gere um novo: o antigo para de funcionar.</p>
            </>
          ) : <p className="text-sm text-muted-foreground">Indisponível.</p>}
        </Secao>

        <Secao id="integracoes" titulo="Integrações externas" descricao="Assistentes de IA e outros aplicativos que você autorizar podem consultar sua agenda, só para leitura. Começa desligado.">
          <Integracoes ativasIniciais={integracoesAtivas} usos={usosIntegracao} />
        </Secao>

        <Secao titulo="Seus dados" descricao="Cópia completa em JSON: hábitos, cadeias, registros, agenda, freelas e horas.">
          <Button variant="outline" size="sm" disabled={ocupado} onClick={() => agir(async () => {
            const tabelas = ["profiles", "habits", "chains", "chain_steps", "checks", "daily_flex_rules", "events", "feriados", "freelas", "freela_time_logs", "reminder_slots", "pendencias", "tarefas", "semestres", "disciplinas", "aulas", "avaliacoes", "tarefas_recorrentes", "candidaturas", "focos", "projetos", "projeto_features"];
            const copia: Record<string, unknown[]> = {};
            for (const t of tabelas) {
              const linhas: unknown[] = [];
              for (let de = 0; ; de += 1000) {
                const { data, error } = await sb.from(t).select("*").range(de, de + 999);
                if (error) throw new Error(`Falha ao exportar ${t}: ${error.message}`);
                linhas.push(...(data ?? []));
                if (!data || data.length < 1000) break;
              }
              copia[t] = linhas;
            }
            const blob = new Blob([JSON.stringify({ exportado_em: new Date().toISOString(), ...copia }, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `cadeia-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }, "Backup baixado.")}>
            <FileDown className="size-4" /> Baixar backup (JSON)
          </Button>
        </Secao>

        <Secao titulo="Conta e aparência">
          <p className="text-sm">Conectado como <strong>{email}</strong></p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}>
              <span className="dark:hidden">Usar tema escuro</span><span className="hidden dark:inline">Usar tema claro</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={async () => {
              if (localStorage.getItem("cadeia:fila-checks")?.length && localStorage.getItem("cadeia:fila-checks") !== "[]"
                && !confirm("Há registros feitos sem conexão que ainda não foram enviados. Sair mesmo assim?")) return;
              await sb.auth.signOut();
              // Não deixa telas salvas offline nem dados locais no aparelho.
              for (const k of ["cadeia:fila-checks", "cadeia:cronometro"]) localStorage.removeItem(k);
              if ("caches" in window) for (const n of await caches.keys()) await caches.delete(n);
              router.replace("/entrar");
            }}>
              <LogOut className="size-4" /> Sair
            </Button>
          </div>
          <form className="flex max-w-md flex-wrap items-end gap-2 pt-2" onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const senha = (form.elements.namedItem("nova-senha") as HTMLInputElement).value;
            const repetir = (form.elements.namedItem("repetir-senha") as HTMLInputElement).value;
            if (senha.length < 8) return toast.error("A senha precisa de pelo menos 8 caracteres.");
            if (senha !== repetir) return toast.error("As senhas não conferem.");
            const { error } = await sb.auth.updateUser({ password: senha });
            if (error) return toast.error(error.message);
            form.reset();
            toast.success("Senha alterada.");
          }}>
            <div className="min-w-40 flex-1 space-y-1.5">
              <Label htmlFor="nova-senha" className="text-[13px]">Nova senha</Label>
              <Input id="nova-senha" name="nova-senha" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="min-w-40 flex-1 space-y-1.5">
              <Label htmlFor="repetir-senha" className="text-[13px]">Repetir</Label>
              <Input id="repetir-senha" name="repetir-senha" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            <Button type="submit" variant="outline" size="sm" className="h-9">Trocar senha</Button>
          </form>
        </Secao>
      </div>
    </>
  );
}
