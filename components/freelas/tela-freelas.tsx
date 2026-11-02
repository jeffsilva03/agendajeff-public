"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Briefcase, CalendarClock, Clock, ExternalLink, Play, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { iniciarFreela, useCronometro } from "@/lib/cronometro";
import { diasEntre, resumoFreelas } from "@motor";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { excluirFreela, marcarPortfolio, mudarStatusFreela, registrarHoras, removerHoras, salvarFreela, type DadosFreela, type StatusFreela } from "@/lib/mutacoes";
import { diaMes } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cabecalho } from "@/components/app/cabecalho";

export interface Freela {
  id: string; cliente: string; titulo: string; descricao: string | null; status: StatusFreela; prazo: string | null;
  valor: number | null; horas_estimadas: number | null; repositorio_url: string | null; portfolio_registrado: boolean; criado_em: string;
}
export interface RegistroHoras { id: string; freela_id: string; data_local: string; horas: number; nota: string | null }

const COLUNAS: { id: StatusFreela; titulo: string; cor: string }[] = [
  { id: "proposta", titulo: "Proposta", cor: "var(--muted-foreground)" },
  { id: "em_andamento", titulo: "Em andamento", cor: "var(--tag-tarde)" },
  { id: "entregue", titulo: "Entregue", cor: "var(--minimo)" },
  { id: "pago", titulo: "Pago", cor: "var(--feito)" },
];
const ROTULO_STATUS: Record<StatusFreela, string> = { proposta: "Proposta", em_andamento: "Em andamento", entregue: "Entregue", pago: "Pago", cancelado: "Cancelado" };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const horasFmt = (h: number) => `${h.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;

export function TelaFreelas({ freelas: doServidor, registros, hoje }: { freelas: Freela[]; registros: RegistroHoras[]; hoje: string }) {
  const router = useRouter();
  // Status otimista: o cartão muda de coluna na hora; o servidor confirma em seguida.
  const [statusLocal, setStatusLocal] = useState<Record<string, StatusFreela>>({});
  const freelas = doServidor.map((f) => (statusLocal[f.id] ? { ...f, status: statusLocal[f.id] } : f));
  const sb = criarClienteNavegador();
  const [edicao, setEdicao] = useState<Freela | "novo" | null>(useSearchParams().get("novo") ? "novo" : null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<Freela | null>(null);
  const [verCancelados, setVerCancelados] = useState(false);
  const [arrastando, setArrastando] = useState<Freela | null>(null);

  const { horasPorFreela, horasMes, aReceber, recebido } = resumoFreelas(freelas, registros, hoje);
  const horasDe = (id: string) => horasPorFreela.get(id) ?? 0;
  const ativos = freelas.filter((f) => f.status === "em_andamento").length;
  const cancelados = freelas.filter((f) => f.status === "cancelado");

  async function mudar(f: Freela, status: StatusFreela) {
    if (f.status === status) return;
    setStatusLocal((m) => ({ ...m, [f.id]: status }));
    try {
      await mudarStatusFreela(sb, f.id, status);
      toast.success(`${f.titulo}: ${ROTULO_STATUS[status].toLowerCase()}.`);
      if (status === "entregue" && !f.portfolio_registrado) setPortfolio({ ...f, status });
      router.refresh();
    } catch (e) {
      setStatusLocal((m) => { const n = { ...m }; delete n[f.id]; return n; });
      toast.error((e as Error).message);
    }
  }

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const aoSoltar = (e: DragEndEvent) => {
    setArrastando(null);
    const f = freelas.find((x) => x.id === e.active.id);
    if (f && e.over) mudar(f, e.over.id as StatusFreela);
  };
  const detalhe = freelas.find((f) => f.id === aberto) ?? null;

  return (
    <>
      <Cabecalho titulo="Freelas" acoes={<><Button size="sm" variant="outline" asChild><Link href="/candidaturas"><Send className="size-4" /> Candidaturas</Link></Button><Button size="sm" onClick={() => setEdicao("novo")}><Plus className="size-4" /> Freela</Button></>}>
        Projetos, prazos e horas. Os prazos aparecem na Agenda e nos lembretes das 8h.
      </Cabecalho>

      {freelas.length === 0 ? (
        <div className="mx-4 grid place-items-center rounded-xl border border-dashed px-6 py-16 text-center md:mx-8">
          <Briefcase className="size-8 text-muted-foreground" aria-hidden />
          <h2 className="mt-4 font-medium">Nenhum freela ainda</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Cadastre o primeiro projeto com cliente, prazo e valor. Depois é só registrar as horas.</p>
          <Button className="mt-5" onClick={() => setEdicao("novo")}><Plus className="size-4" /> Cadastrar freela</Button>
        </div>
      ) : (
        <>
          <section aria-label="Resumo" className="mx-4 mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:mx-8 lg:grid-cols-4">
            {[
              ["Em andamento", String(ativos)],
              ["Horas neste mês", horasFmt(horasMes)],
              ["A receber (entregues)", brl(aReceber)],
              ["Recebido", brl(recebido)],
            ].map(([k, v]) => (
              <div key={k} className="bg-card p-4">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="numeros mt-1.5 text-xl font-semibold tracking-tight">{v}</p>
              </div>
            ))}
          </section>

          <DndContext id="quadro-freelas" sensors={sensores} onDragStart={(e) => setArrastando(freelas.find((f) => f.id === e.active.id) ?? null)} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
            <div className="trilho flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-6 md:grid md:snap-none md:grid-cols-4 md:items-start md:overflow-visible md:px-8">
              {COLUNAS.map((c) => {
                const lista = freelas.filter((f) => f.status === c.id).sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));
                return (
                  <Coluna key={c.id} {...c} total={lista.length}>
                    {lista.map((f) => <CartaoFreela key={f.id} f={f} horas={horasDe(f.id)} hoje={hoje} onAbrir={() => setAberto(f.id)} />)}
                  </Coluna>
                );
              })}
            </div>
            <DragOverlay dropAnimation={null}>{arrastando && <CartaoFreela f={arrastando} horas={horasDe(arrastando.id)} hoje={hoje} sobreposto onAbrir={() => {}} />}</DragOverlay>
          </DndContext>

          {cancelados.length > 0 && (
            <div className="px-4 pb-10 md:px-8">
              <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={() => setVerCancelados((v) => !v)}>
                {verCancelados ? "Esconder" : "Ver"} cancelados ({cancelados.length})
              </button>
              {verCancelados && (
                <ul className="mt-3 grid gap-2 md:grid-cols-3">
                  {cancelados.map((f) => <li key={f.id}><CartaoFreela f={f} horas={horasDe(f.id)} hoje={hoje} onAbrir={() => setAberto(f.id)} estatico /></li>)}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <Sheet open={!!detalhe} onOpenChange={(o) => !o && setAberto(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {detalhe && (
            <DetalheFreela key={detalhe.id} f={detalhe} registros={registros.filter((r) => r.freela_id === detalhe.id)} hoje={hoje}
              onEditar={() => setEdicao(detalhe)} onMudar={(s) => mudar(detalhe, s)}
              onPortfolio={() => setPortfolio(detalhe)} />
          )}
        </SheetContent>
      </Sheet>

      {edicao && (
        <DialogoFreela key={edicao === "novo" ? "novo" : edicao.id} freela={edicao === "novo" ? null : edicao} onFechar={() => setEdicao(null)}
          onSalvar={async (d) => {
            const anterior = edicao === "novo" ? null : edicao;
            await salvarFreela(sb, d, anterior?.id);
            if (anterior && anterior.status !== "entregue" && d.status === "entregue" && !anterior.portfolio_registrado) setPortfolio({ ...anterior, ...d } as Freela);
            router.refresh();
          }}
          onExcluir={edicao !== "novo" ? async () => { await excluirFreela(sb, edicao.id); setAberto(null); router.refresh(); } : undefined} />
      )}

      <Dialog open={!!portfolio} onOpenChange={(o) => !o && setPortfolio(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-minimo" /> Vale virar portfólio?</DialogTitle>
            <DialogDescription>
              {portfolio?.titulo} foi entregue. Registrar como item de portfólio (GitHub, LinkedIn ou site) ajuda nas candidaturas.
              Nada é publicado automaticamente.
            </DialogDescription>
          </DialogHeader>
          {portfolio && (
            <div className="space-y-2 rounded-lg border bg-secondary/40 p-3 text-sm">
              <p className="text-xs text-muted-foreground">Rascunho para você adaptar:</p>
              <p><strong>{portfolio.titulo}</strong>{portfolio.cliente ? ` para ${portfolio.cliente}` : ""}.{portfolio.descricao ? ` ${portfolio.descricao}` : ""}</p>
              {portfolio.repositorio_url && <p className="truncate text-xs text-muted-foreground">Repositório: {portfolio.repositorio_url}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPortfolio(null)}>Agora não</Button>
            <Button onClick={async () => {
              if (!portfolio) return;
              try { await marcarPortfolio(sb, portfolio.id, true); toast.success("Marcado como registrado no portfólio."); setPortfolio(null); router.refresh(); }
              catch (e) { toast.error((e as Error).message); }
            }}>Já registrei</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Coluna({ id, titulo, cor, total, children }: { id: StatusFreela; titulo: string; cor: string; total: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} aria-label={`${titulo}, ${total}`}
      className={cn("flex w-[86vw] max-w-sm shrink-0 snap-center flex-col self-start rounded-xl border bg-coluna p-1.5 md:w-auto md:max-w-none", isOver && "border-ring/50 bg-accent/40")}>
      <header className="flex items-center gap-2 px-2 pt-1.5 pb-2">
        <span className="size-2 rounded-full" style={{ background: cor }} aria-hidden />
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <span className="numeros text-sm text-muted-foreground">{total}</span>
      </header>
      <div className="flex min-h-20 flex-col gap-1.5">
        {children}
        {total === 0 && <p className="grid min-h-20 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">Arraste para cá</p>}
      </div>
    </section>
  );
}

function CartaoFreela({ f, horas, hoje, onAbrir, sobreposto, estatico }: { f: Freela; horas: number; hoje: string; onAbrir: () => void; sobreposto?: boolean; estatico?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: f.id, disabled: estatico });
  const faltam = f.prazo ? diasEntre(hoje, f.prazo) : null;
  const aberto = f.status === "proposta" || f.status === "em_andamento";
  const est = f.horas_estimadas ? Number(f.horas_estimadas) : null;
  return (
    <article ref={sobreposto ? undefined : setNodeRef} {...(sobreposto || estatico ? {} : { ...listeners, ...attributes })} role="group"
      aria-roledescription="cartão arrastável" aria-label={`${f.titulo}, ${f.cliente}`}
      className={cn("touch-manipulation rounded-lg border bg-card text-left outline-none hover:border-input focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "opacity-25", sobreposto && "rotate-[1.2deg] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.6)]")}>
      <button type="button" onClick={onAbrir} className="block w-full p-3 text-left">
        <p className="truncate text-xs text-muted-foreground">{f.cliente}</p>
        <h3 className="mt-0.5 text-sm leading-snug font-medium">{f.titulo}</h3>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {f.prazo && (
            <span className={cn("flex items-center gap-1", aberto && faltam !== null && faltam < 0 && "text-destructive", aberto && faltam !== null && faltam >= 0 && faltam <= 3 && "text-aviso")}>
              <CalendarClock className="size-3.5" aria-hidden />
              {diaMes(f.prazo)}{aberto && faltam !== null && (faltam < 0 ? `, atrasado ${-faltam} d` : faltam === 0 ? ", hoje" : `, em ${faltam} d`)}
            </span>
          )}
          {f.valor !== null && <span className="numeros">{brl(Number(f.valor))}</span>}
          <span className="numeros flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{horasFmt(horas)}{est ? ` de ${horasFmt(est)}` : ""}</span>
        </div>
        {est ? (
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <span className={cn("block h-full rounded-full", horas > est ? "bg-destructive" : "bg-tag-tarde")} style={{ width: `${Math.min(100, (horas / est) * 100)}%` }} />
          </span>
        ) : null}
        {(f.status === "entregue" || f.status === "pago") && !f.portfolio_registrado && (
          <span className="mt-2 inline-flex items-center gap-1 rounded bg-minimo/15 px-1.5 py-0.5 text-[11px] text-minimo"><Sparkles className="size-3" aria-hidden />portfólio pendente</span>
        )}
      </button>
    </article>
  );
}

function DetalheFreela({ f, registros, hoje, onEditar, onMudar, onPortfolio }: {
  f: Freela; registros: RegistroHoras[]; hoje: string; onEditar: () => void; onMudar: (s: StatusFreela) => void; onPortfolio: () => void;
}) {
  const router = useRouter();
  const sb = criarClienteNavegador();
  const cronometro = useCronometro();
  const [data, setData] = useState(hoje);
  const [horas, setHoras] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const total = registros.reduce((s, r) => s + Number(r.horas), 0);
  const est = f.horas_estimadas ? Number(f.horas_estimadas) : null;
  const ordenados = [...registros].sort((a, b) => b.data_local.localeCompare(a.data_local));

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-lg">{f.titulo}</SheetTitle>
        <SheetDescription>{f.cliente}</SheetDescription>
      </SheetHeader>
      <div className="space-y-6 px-4 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={f.status} onValueChange={(v) => onMudar(v as StatusFreela)}>
            <SelectTrigger className="w-44" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(ROTULO_STATUS) as StatusFreela[]).map((s) => <SelectItem key={s} value={s}>{ROTULO_STATUS[s]}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={onEditar}>Editar dados</Button>
          {(f.status === "proposta" || f.status === "em_andamento") && (
            <Button size="sm" disabled={cronometro?.tipo === "freela" && cronometro.freelaId === f.id}
              onClick={() => {
                if (cronometro && !confirm("Já existe um cronômetro ativo. Substituir?")) return;
                iniciarFreela(f.id, f.titulo);
                toast("Cronômetro iniciado", { description: "Ao parar, as horas são registradas neste freela." });
              }}>
              <Play className="size-4" /> {cronometro?.tipo === "freela" && cronometro.freelaId === f.id ? "Contando" : "Iniciar cronômetro"}
            </Button>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border text-sm">
          {[
            ["Prazo", f.prazo ? diaMes(f.prazo) : "sem prazo"],
            ["Valor", f.valor !== null ? brl(Number(f.valor)) : "—"],
            ["Horas gastas", horasFmt(total)],
            ["Estimadas", est ? horasFmt(est) : "—"],
          ].map(([k, v]) => (
            <div key={k} className="bg-card px-3 py-2.5"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="numeros mt-0.5 font-medium">{v}</dd></div>
          ))}
        </dl>
        {est && f.valor ? <p className="numeros -mt-3 text-xs text-muted-foreground">Valor por hora até agora: {total ? brl(Number(f.valor) / total) : "—"} (estimado: {brl(Number(f.valor) / est)})</p> : null}

        {f.descricao && <p className="text-sm whitespace-pre-line text-muted-foreground">{f.descricao}</p>}
        {f.repositorio_url && (
          <a href={f.repositorio_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm underline underline-offset-4">
            <ExternalLink className="size-3.5" aria-hidden /> Repositório
          </a>
        )}
        {(f.status === "entregue" || f.status === "pago") && (
          f.portfolio_registrado
            ? <p className="text-sm text-feito">Registrado no portfólio.</p>
            : <Button variant="outline" size="sm" onClick={onPortfolio}><Sparkles className="size-4" /> Registrar no portfólio</Button>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-medium">Registrar horas</h3>
          <form className="grid grid-cols-[1fr_6rem] gap-2" onSubmit={async (e) => {
            e.preventDefault();
            const h = Number(horas.replace(",", "."));
            if (!(h > 0)) { toast.error("Informe as horas (ex.: 1,5)."); return; }
            setOcupado(true);
            try { await registrarHoras(sb, f.id, data, h, nota); setHoras(""); setNota(""); toast.success("Horas registradas."); router.refresh(); }
            catch (err) { toast.error((err as Error).message); } finally { setOcupado(false); }
          }}>
            <Input type="date" aria-label="Data" value={data} onChange={(e) => setData(e.target.value)} required />
            <Input inputMode="decimal" aria-label="Horas" placeholder="Horas" value={horas} onChange={(e) => setHoras(e.target.value)} required />
            <Input aria-label="O que foi feito" placeholder="O que foi feito (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} className="col-span-2" />
            <Button type="submit" size="sm" disabled={ocupado} className="col-span-2"><Plus className="size-4" /> Registrar</Button>
          </form>
          {ordenados.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {ordenados.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="numeros w-12 shrink-0 text-muted-foreground">{diaMes(r.data_local)}</span>
                  <span className="numeros w-14 shrink-0 font-medium">{horasFmt(Number(r.horas))}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.nota}</span>
                  <Button variant="ghost" size="icon" className="size-8" aria-label="Remover registro"
                    onClick={async () => { try { await removerHoras(sb, r.id); router.refresh(); } catch (e) { toast.error((e as Error).message); } }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function DialogoFreela({ freela, onFechar, onSalvar, onExcluir }: {
  freela: Freela | null; onFechar: () => void; onSalvar: (d: DadosFreela) => Promise<void>; onExcluir?: () => Promise<void>;
}) {
  const [d, setD] = useState({
    cliente: freela?.cliente ?? "", titulo: freela?.titulo ?? "", descricao: freela?.descricao ?? "",
    status: freela?.status ?? ("proposta" as StatusFreela), prazo: freela?.prazo ?? "",
    valor: freela?.valor != null ? String(freela.valor) : "", horas: freela?.horas_estimadas != null ? String(freela.horas_estimadas) : "",
    repo: freela?.repositorio_url ?? "",
  });
  const [ocupado, setOcupado] = useState(false);
  const num = (s: string) => (s.trim() ? Number(s.replace(/\./g, "").replace(",", ".")) : null);
  const campo = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value }) });

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{freela ? "Editar freela" : "Novo freela"}</DialogTitle>
          <DialogDescription>O prazo entra na Agenda, com lembrete na véspera e no dia.</DialogDescription>
        </DialogHeader>
        <form id="form-freela" className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const valor = num(d.valor), horas = num(d.horas);
          if ((valor !== null && !(valor >= 0)) || (horas !== null && !(horas >= 0))) { toast.error("Valor e horas precisam ser números."); return; }
          setOcupado(true);
          try {
            await onSalvar({ cliente: d.cliente, titulo: d.titulo, descricao: d.descricao, status: d.status, prazo: d.prazo || null, valor, horasEstimadas: horas, repositorioUrl: d.repo });
            toast.success(freela ? "Freela salvo." : "Freela cadastrado."); onFechar();
          } catch (err) { toast.error((err as Error).message); } finally { setOcupado(false); }
        }}>
          <div className="space-y-1.5"><Label htmlFor="f-cliente" className="text-[13px]">Cliente</Label><Input id="f-cliente" required {...campo("cliente")} autoFocus /></div>
          <div className="space-y-1.5"><Label htmlFor="f-titulo" className="text-[13px]">Projeto</Label><Input id="f-titulo" required {...campo("titulo")} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="f-desc" className="text-[13px]">Descrição</Label><Textarea id="f-desc" rows={3} {...campo("descricao")} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="f-status" className="text-[13px]">Status</Label>
            <Select value={d.status} onValueChange={(v) => setD({ ...d, status: v as StatusFreela })}>
              <SelectTrigger id="f-status" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(ROTULO_STATUS) as StatusFreela[]).map((s) => <SelectItem key={s} value={s}>{ROTULO_STATUS[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="f-prazo" className="text-[13px]">Prazo</Label><Input id="f-prazo" type="date" {...campo("prazo")} /></div>
          <div className="space-y-1.5"><Label htmlFor="f-valor" className="text-[13px]">Valor (R$)</Label><Input id="f-valor" inputMode="decimal" placeholder="Ex.: 1.500,00" {...campo("valor")} /></div>
          <div className="space-y-1.5"><Label htmlFor="f-horas" className="text-[13px]">Horas estimadas</Label><Input id="f-horas" inputMode="decimal" placeholder="Ex.: 20" {...campo("horas")} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="f-repo" className="text-[13px]">Repositório</Label><Input id="f-repo" type="url" placeholder="https://github.com/…" {...campo("repo")} /></div>
        </form>
        <DialogFooter className="sm:justify-between">
          {onExcluir ? (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={ocupado}
              onClick={async () => { if (!confirm("Excluir este freela e as horas registradas?")) return; setOcupado(true); try { await onExcluir(); toast.success("Freela excluído."); onFechar(); } catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); } }}>
              Excluir
            </Button>
          ) : <span />}
          <Button type="submit" form="form-freela" disabled={ocupado}>{freela ? "Salvar" : "Cadastrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
