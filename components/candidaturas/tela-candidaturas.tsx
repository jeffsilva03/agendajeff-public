"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarClock, ExternalLink, Plus, Send } from "lucide-react";
import { diasEntre, horaCurta, resumoCandidaturas, STATUS_CANDIDATURA, type StatusCandidatura } from "@motor";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { excluirCandidatura, marcarHabitoCandidatura, salvarCandidatura, type DadosCandidatura } from "@/lib/mutacoes";
import { diaMes } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cabecalho } from "@/components/app/cabecalho";

export interface Candidatura {
  id: string; empresa: string; vaga: string; link: string | null; origem: string | null; status: StatusCandidatura;
  data_envio: string; proxima_acao: string | null; proxima_data: string | null; proxima_hora: string | null; notas: string | null;
}

const COLUNAS: { id: StatusCandidatura; cor: string }[] = [
  { id: "enviada", cor: "var(--muted-foreground)" },
  { id: "em_processo", cor: "var(--tag-tarde)" },
  { id: "entrevista", cor: "var(--minimo)" },
  { id: "oferta", cor: "var(--feito)" },
];
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function TelaCandidaturas({ candidaturas: doServidor, hoje }: { candidaturas: Candidatura[]; hoje: string }) {
  const router = useRouter();
  const sb = criarClienteNavegador();
  const [statusLocal, setStatusLocal] = useState<Record<string, StatusCandidatura>>({});
  const lista = doServidor.map((c) => (statusLocal[c.id] ? { ...c, status: statusLocal[c.id] } : c));
  const [edicao, setEdicao] = useState<Candidatura | "nova" | null>(useSearchParams().get("novo") ? "nova" : null);
  const [verEncerradas, setVerEncerradas] = useState(false);
  const [arrastando, setArrastando] = useState<Candidatura | null>(null);

  const resumo = resumoCandidaturas(lista.map((c) => ({ id: c.id, empresa: c.empresa, vaga: c.vaga, status: c.status, dataEnvio: c.data_envio, proximaAcao: c.proxima_acao, proximaData: c.proxima_data, proximaHora: c.proxima_hora })), hoje);
  const encerradas = lista.filter((c) => c.status === "recusada" || c.status === "desisti");

  async function mudar(c: Candidatura, status: StatusCandidatura) {
    if (c.status === status) return;
    setStatusLocal((m) => ({ ...m, [c.id]: status }));
    try {
      await salvarCandidatura(sb, paraDados({ ...c, status }), c.id);
      toast.success(`${c.empresa}: ${STATUS_CANDIDATURA[status].toLowerCase()}.`);
      router.refresh();
    } catch (e) {
      setStatusLocal((m) => { const n = { ...m }; delete n[c.id]; return n; });
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
    const c = lista.find((x) => x.id === e.active.id);
    if (c && e.over) mudar(c, e.over.id as StatusCandidatura);
  };

  return (
    <>
      <Cabecalho titulo="Candidaturas" acoes={<Button size="sm" onClick={() => setEdicao("nova")}><Plus className="size-4" /> Candidatura</Button>}>
        Vagas de estágio, aprendiz e emprego. Registrar uma candidatura no dia marca o hábito &quot;Enviar candidaturas&quot;.
      </Cabecalho>

      {lista.length === 0 ? (
        <div className="mx-4 grid place-items-center rounded-xl border border-dashed px-6 py-16 text-center md:mx-8">
          <Send className="size-8 text-muted-foreground" aria-hidden />
          <h2 className="mt-4 font-medium">Nenhuma candidatura registrada</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Anote empresa, vaga e onde você se candidatou. Depois é só mover o cartão conforme o processo andar.</p>
          <Button className="mt-5" onClick={() => setEdicao("nova")}><Plus className="size-4" /> Registrar candidatura</Button>
        </div>
      ) : (
        <>
          <section aria-label="Resumo" className="mx-4 mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:mx-8 lg:grid-cols-4">
            {[
              ["Candidaturas", String(resumo.total)],
              ["Últimos 7 dias", String(resumo.ultimos7Dias)],
              ["Tiveram resposta", `${pct(resumo.taxaResposta)}`],
              ["Entrevistas e ofertas", String(resumo.por.entrevista + resumo.por.oferta)],
            ].map(([k, v]) => (
              <div key={k} className="bg-card p-4">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="numeros mt-1.5 text-xl font-semibold tracking-tight">{v}</p>
              </div>
            ))}
          </section>

          <DndContext id="quadro-candidaturas" sensors={sensores} onDragStart={(e) => setArrastando(lista.find((c) => c.id === e.active.id) ?? null)} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
            <div className="trilho flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-6 md:grid md:snap-none md:grid-cols-4 md:items-start md:overflow-visible md:px-8">
              {COLUNAS.map((col) => {
                const daColuna = lista.filter((c) => c.status === col.id).sort((a, b) => (a.proxima_data ?? "9999").localeCompare(b.proxima_data ?? "9999") || b.data_envio.localeCompare(a.data_envio));
                return (
                  <Coluna key={col.id} id={col.id} cor={col.cor} total={daColuna.length}>
                    {daColuna.map((c) => <CartaoCandidatura key={c.id} c={c} hoje={hoje} onAbrir={() => setEdicao(c)} />)}
                  </Coluna>
                );
              })}
            </div>
            <DragOverlay dropAnimation={null}>{arrastando && <CartaoCandidatura c={arrastando} hoje={hoje} sobreposto onAbrir={() => {}} />}</DragOverlay>
          </DndContext>

          {encerradas.length > 0 && (
            <div className="px-4 pb-10 md:px-8">
              <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={() => setVerEncerradas((v) => !v)}>
                {verEncerradas ? "Esconder" : "Ver"} encerradas ({encerradas.length})
              </button>
              {verEncerradas && (
                <ul className="mt-3 divide-y rounded-xl border">
                  {encerradas.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => setEdicao(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent">
                        <span className="numeros w-12 shrink-0 text-muted-foreground">{diaMes(c.data_envio)}</span>
                        <span className="min-w-0 flex-1 truncate"><span className="font-medium">{c.empresa}</span> <span className="text-muted-foreground">{c.vaga}</span></span>
                        <span className="text-xs text-muted-foreground">{STATUS_CANDIDATURA[c.status]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {edicao && (
        <DialogoCandidatura key={edicao === "nova" ? "nova" : edicao.id} candidatura={edicao === "nova" ? null : edicao} hoje={hoje} onFechar={() => setEdicao(null)}
          onSalvar={async (d) => {
            await salvarCandidatura(sb, d, edicao === "nova" ? undefined : edicao.id);
            if (edicao === "nova") {
              const marcado = await marcarHabitoCandidatura(sb, d.dataEnvio);
              if (marcado) toast.success(`${marcado}: mínimo cumprido em ${diaMes(d.dataEnvio)}.`);
            }
            router.refresh();
          }}
          onExcluir={edicao !== "nova" ? async () => { await excluirCandidatura(sb, edicao.id); router.refresh(); } : undefined} />
      )}
    </>
  );
}

const paraDados = (c: Candidatura): DadosCandidatura => ({
  empresa: c.empresa, vaga: c.vaga, link: c.link, origem: c.origem, status: c.status, dataEnvio: c.data_envio,
  proximaAcao: c.proxima_acao, proximaData: c.proxima_data, proximaHora: c.proxima_hora ? c.proxima_hora.slice(0, 5) : null, notas: c.notas,
});

function Coluna({ id, cor, total, children }: { id: StatusCandidatura; cor: string; total: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} aria-label={`${STATUS_CANDIDATURA[id]}, ${total}`}
      className={cn("flex w-[86vw] max-w-sm shrink-0 snap-center flex-col self-start rounded-xl border bg-coluna p-1.5 md:w-auto md:max-w-none", isOver && "border-ring/50 bg-accent/40")}>
      <header className="flex items-center gap-2 px-2 pt-1.5 pb-2">
        <span className="size-2 rounded-full" style={{ background: cor }} aria-hidden />
        <h2 className="text-sm font-semibold">{STATUS_CANDIDATURA[id]}</h2>
        <span className="numeros text-sm text-muted-foreground">{total}</span>
      </header>
      <div className="flex min-h-20 flex-col gap-1.5">
        {children}
        {total === 0 && <p className="grid min-h-20 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">Arraste para cá</p>}
      </div>
    </section>
  );
}

function CartaoCandidatura({ c, hoje, onAbrir, sobreposto }: { c: Candidatura; hoje: string; onAbrir: () => void; sobreposto?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id });
  const ha = diasEntre(c.data_envio, hoje);
  const faltam = c.proxima_data ? diasEntre(hoje, c.proxima_data) : null;
  return (
    <article ref={sobreposto ? undefined : setNodeRef} {...(sobreposto ? {} : { ...listeners, ...attributes })} role="group"
      aria-roledescription="cartão arrastável" aria-label={`${c.empresa}, ${c.vaga}`}
      className={cn("touch-manipulation rounded-lg border bg-card outline-none hover:border-input focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "opacity-25", sobreposto && "rotate-[1.2deg] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.6)]")}>
      <button type="button" onClick={onAbrir} className="block w-full p-3 text-left">
        <p className="truncate text-sm font-medium">{c.empresa}</p>
        <p className="truncate text-xs text-muted-foreground">{c.vaga}{c.origem ? `, via ${c.origem}` : ""}</p>
        <p className="numeros mt-2 text-xs text-muted-foreground">Enviada {ha === 0 ? "hoje" : ha === 1 ? "ontem" : `há ${ha} dias`}</p>
        {c.proxima_data && (
          <p className={cn("numeros mt-1 flex items-center gap-1 text-xs", faltam !== null && faltam < 0 ? "text-destructive" : faltam !== null && faltam <= 2 ? "text-aviso" : "text-muted-foreground")}>
            <CalendarClock className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{c.proxima_acao || "Próxima etapa"}: {diaMes(c.proxima_data)}{c.proxima_hora ? ` às ${horaCurta(c.proxima_hora.slice(0, 5))}` : ""}</span>
          </p>
        )}
      </button>
    </article>
  );
}

function DialogoCandidatura({ candidatura, hoje, onFechar, onSalvar, onExcluir }: {
  candidatura: Candidatura | null; hoje: string; onFechar: () => void; onSalvar: (d: DadosCandidatura) => Promise<void>; onExcluir?: () => Promise<void>;
}) {
  const [d, setD] = useState<DadosCandidatura>(candidatura ? paraDados(candidatura) : {
    empresa: "", vaga: "", link: null, origem: null, status: "enviada", dataEnvio: hoje, proximaAcao: null, proximaData: null, proximaHora: null, notas: null,
  });
  const [ocupado, setOcupado] = useState(false);
  const campo = (k: keyof DadosCandidatura) => ({ value: (d[k] as string | null) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value || null }) });
  async function agir(f: () => Promise<void>, ok: string) {
    setOcupado(true);
    try { await f(); toast.success(ok); onFechar(); } catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{candidatura ? "Editar candidatura" : "Nova candidatura"}</DialogTitle>
          <DialogDescription>A próxima etapa (entrevista, teste, retorno) entra na Agenda e nos lembretes.</DialogDescription>
        </DialogHeader>
        <form id="form-cand" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          if (!d.empresa?.trim() || !d.vaga?.trim()) { toast.error("Preencha empresa e vaga."); return; }
          agir(() => onSalvar(d), candidatura ? "Candidatura salva." : "Candidatura registrada.");
        }}>
          <div className="space-y-1.5"><Label htmlFor="c-emp" className="text-[13px]">Empresa</Label><Input id="c-emp" required {...campo("empresa")} autoFocus /></div>
          <div className="space-y-1.5"><Label htmlFor="c-vaga" className="text-[13px]">Vaga</Label><Input id="c-vaga" required {...campo("vaga")} placeholder="Ex.: Estágio em desenvolvimento" /></div>
          <div className="space-y-1.5"><Label htmlFor="c-origem" className="text-[13px]">Onde</Label><Input id="c-origem" {...campo("origem")} placeholder="LinkedIn, Gupy, indicação…" /></div>
          <div className="space-y-1.5"><Label htmlFor="c-envio" className="text-[13px]">Enviada em</Label><Input id="c-envio" type="date" required value={d.dataEnvio} onChange={(e) => setD({ ...d, dataEnvio: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="c-link" className="text-[13px]">Link da vaga</Label><Input id="c-link" type="url" {...campo("link")} placeholder="https://…" /></div>
          <div className="space-y-1.5">
            <Label htmlFor="c-status" className="text-[13px]">Status</Label>
            <Select value={d.status} onValueChange={(v) => setD({ ...d, status: v as StatusCandidatura })}>
              <SelectTrigger id="c-status" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(STATUS_CANDIDATURA) as StatusCandidatura[]).map((s) => <SelectItem key={s} value={s}>{STATUS_CANDIDATURA[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="c-acao" className="text-[13px]">Próxima etapa</Label><Input id="c-acao" {...campo("proximaAcao")} placeholder="Ex.: Entrevista com RH" /></div>
          <div className="space-y-1.5"><Label htmlFor="c-pdata" className="text-[13px]">Data da etapa</Label><Input id="c-pdata" type="date" {...campo("proximaData")} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-phora" className="text-[13px]">Horário</Label><Input id="c-phora" type="time" {...campo("proximaHora")} disabled={!d.proximaData} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="c-notas" className="text-[13px]">Notas</Label><Textarea id="c-notas" rows={2} {...campo("notas")} placeholder="Contato, salário, impressões…" /></div>
        </form>
        <DialogFooter className="sm:justify-between">
          <span className="flex gap-1">
            {onExcluir && <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={ocupado} onClick={() => confirm("Excluir esta candidatura?") && agir(onExcluir, "Candidatura excluída.")}>Excluir</Button>}
            {candidatura?.link && <Button type="button" variant="ghost" asChild><a href={candidatura.link} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Abrir vaga</a></Button>}
          </span>
          <Button type="submit" form="form-cand" disabled={ocupado}>{candidatura ? "Salvar" : "Registrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
