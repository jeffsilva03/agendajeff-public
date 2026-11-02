"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, TriangleAlert, BellRing, CalendarOff, GraduationCap } from "lucide-react";
import { diaDaSemana, horaCurta, resolverDia, somarDias, type DiaResolvido, type Evento } from "@motor";
import type { ContextoCompleto } from "@/lib/dados";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { definirFeriadoAtivo, excluirEvento, salvarEvento } from "@/lib/mutacoes";
import { COR_FLEXIVEL, corDaCadeia, corDisciplina, dataPorExtenso, MES_CURTO } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Cabecalho } from "@/components/app/cabecalho";
import { DialogoEvento } from "./dialogo-evento";

type Visao = "semana" | "mes";
const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const segundaDe = (d: string) => somarDias(d, -((diaDaSemana(d) + 6) % 7));

interface Item {
  chave: string;
  tipo: "compromisso" | "prazo" | "lembrete" | "excecao" | "aula";
  cor?: string;
  link?: string;
  titulo: string;
  detalhe?: string;
  hora?: string | null;
  local?: string | null;
  evento?: Evento;
  freela?: boolean;
}

function itensDoDia(dia: DiaResolvido, ctx: ContextoCompleto): Item[] {
  const porId = new Map(ctx.eventos.map((e) => [e.id, e]));
  const out: Item[] = [];
  for (const a of dia.aulas)
    out.push({ chave: `aula-${a.id}`, tipo: "aula", titulo: a.disciplina, hora: a.inicio, detalhe: `até ${horaCurta(a.fim)}`, local: a.sala, cor: corDisciplina(a.cor), link: "/faculdade" });
  for (const e of ctx.eventos.filter((e) => e.tipo === "excecao_rotina" && e.data === dia.data))
    out.push({ chave: e.id, tipo: "excecao", titulo: e.titulo, evento: e });
  for (const e of dia.compromissos)
    out.push({ chave: e.id, tipo: "compromisso", titulo: e.titulo, hora: e.inicio, detalhe: e.inicio ? (e.fim ? `até ${horaCurta(e.fim)}` : "sem horário de término") : undefined, local: e.local, evento: e });
  for (const p of dia.prazos) {
    const ev = porId.get(p.eventoId);
    out.push({
      chave: `${p.eventoId}-${p.tipo}`, tipo: p.tipo, titulo: p.titulo.replace(/^Prazo: /, ""),
      detalhe: p.tipo === "lembrete" ? `prazo em ${p.dataPrazo.slice(8)}/${p.dataPrazo.slice(5, 7)}` : "vence hoje",
      evento: ev, freela: !!ev?.freelaId || !!ev?.avaliacaoId,
      link: ev?.avaliacaoId ? "/faculdade" : ev?.freelaId ? "/freelas" : undefined,
    });
  }
  return out;
}

export function TelaAgenda({ ctx, hoje }: { ctx: ContextoCompleto; hoje: string }) {
  const router = useRouter();
  const [visao, setVisao] = useState<Visao>("semana");
  const [ref, setRef] = useState(hoje);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<{ evento: Evento | null; data: string } | null>(useSearchParams().get("novo") ? { evento: null, data: hoje } : null);

  const dias = useMemo(() => {
    if (visao === "semana") {
      const s = segundaDe(ref);
      return Array.from({ length: 7 }, (_, i) => somarDias(s, i));
    }
    const primeiro = `${ref.slice(0, 8)}01`;
    const inicio = segundaDe(primeiro);
    return Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
  }, [visao, ref]);
  const resolvidos = useMemo(() => new Map(dias.map((d) => [d, resolverDia(d, ctx)])), [dias, ctx]);

  const mover = (n: number) => {
    if (visao === "semana") return setRef(somarDias(ref, 7 * n));
    const [y, m] = ref.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1, 12));
    setRef(t.toISOString().slice(0, 10));
  };
  const tituloPeriodo = visao === "mes"
    ? `${MES_LONGO[Number(ref.slice(5, 7)) - 1]} de ${ref.slice(0, 4)}`
    : (() => { const a = dias[0], b = dias[6]; return `${Number(a.slice(8))} ${MES_CURTO[Number(a.slice(5, 7)) - 1]} a ${Number(b.slice(8))} ${MES_CURTO[Number(b.slice(5, 7)) - 1]}`; })();

  const sb = criarClienteNavegador();
  const recarregar = () => router.refresh();

  return (
    <>
      <Cabecalho titulo="Agenda" acoes={<><Button size="sm" variant="outline" asChild><Link href="/faculdade"><GraduationCap className="size-4" /> Faculdade</Link></Button><Button size="sm" onClick={() => setEdicao({ evento: null, data: diaAberto ?? (ref >= hoje ? ref : hoje) })}><Plus className="size-4" /> Evento</Button></>}>
        Compromissos, dias sem aula e prazos. Tudo aqui ajusta o seu dia no Hoje.
      </Cabecalho>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 md:px-8">
        <div className="flex items-center rounded-lg border">
          <Button variant="ghost" size="icon" aria-label="Anterior" onClick={() => mover(-1)}><ChevronLeft className="size-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setRef(hoje)}>Hoje</Button>
          <Button variant="ghost" size="icon" aria-label="Próximo" onClick={() => mover(1)}><ChevronRight className="size-4" /></Button>
        </div>
        <h2 className="numeros text-sm font-medium first-letter:uppercase">{tituloPeriodo}</h2>
        <div role="radiogroup" aria-label="Visão" className="ml-auto flex rounded-lg bg-secondary p-0.5">
          {(["semana", "mes"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={visao === v} onClick={() => setVisao(v)}
              className={cn("h-7 rounded-md px-3 text-sm text-muted-foreground", visao === v && "bg-card font-medium text-foreground shadow-sm")}>
              {v === "semana" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-10 md:px-8">
        {visao === "semana" ? (
          <div className="grid gap-2 lg:grid-cols-7">
            {dias.map((d) => {
              const dia = resolvidos.get(d)!;
              const itens = itensDoDia(dia, ctx);
              return (
                <section key={d} aria-label={dataPorExtenso(d)}
                  className={cn("flex min-h-36 flex-col rounded-xl border bg-card", d === hoje && "border-ring/60")}>
                  <button type="button" onClick={() => setDiaAberto(d)} className="flex items-baseline gap-2 px-3 pt-3 pb-2 text-left">
                    <span className="text-xs text-muted-foreground">{SEMANA[(diaDaSemana(d) + 6) % 7]}</span>
                    <span className={cn("numeros text-lg leading-none font-semibold", d === hoje && "text-ring")}>{Number(d.slice(8))}</span>
                    {dia.motivoSemAula && <span className="ml-auto truncate rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{dia.motivoSemAula.startsWith("Feriado") ? "Feriado" : "Sem aula"}</span>}
                  </button>
                  <div className="flex flex-wrap gap-1 px-3 pb-2" aria-label="Cadeias do dia">
                    {dia.cadeias.map((c) => <span key={c.id} title={c.nome} className="h-1 w-5 rounded-full" style={{ background: corDaCadeia(c) }} />)}
                    {dia.flexiveis.length > 0 && <span title={`${dia.flexiveis.length} flexíveis`} className="h-1 w-3 rounded-full" style={{ background: COR_FLEXIVEL }} />}
                  </div>
                  <ul className="flex flex-1 flex-col gap-1 px-1.5 pb-1.5">
                    {itens.map((it) => <LinhaItem key={it.chave} item={it} aviso={dia.avisos.some((a) => a.eventoId === it.evento?.id)} onAbrir={() => it.evento && !it.freela && setEdicao({ evento: it.evento, data: d })} />)}
                    <li className="mt-auto">
                      <button type="button" onClick={() => setEdicao({ evento: null, data: d })}
                        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground">
                        <Plus className="size-3.5" aria-hidden /> Adicionar
                      </button>
                    </li>
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="grid grid-cols-7 border-b bg-superficie text-center text-xs text-muted-foreground">
              {SEMANA.map((s) => <span key={s} className="py-2">{s}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-px bg-border">
              {dias.map((d) => {
                const dia = resolvidos.get(d)!;
                const itens = itensDoDia(dia, ctx).filter((i) => i.tipo !== "aula");
                const foraDoMes = d.slice(0, 7) !== ref.slice(0, 7);
                return (
                  <button key={d} type="button" onClick={() => setDiaAberto(d)} aria-label={`${dataPorExtenso(d)}, ${itens.length} itens`}
                    className={cn("flex min-h-20 flex-col gap-1 bg-card p-1.5 text-left hover:bg-accent md:min-h-28 md:p-2", foraDoMes && "bg-card/40 text-muted-foreground")}>
                    <span className="flex items-center gap-1">
                      <span className={cn("numeros grid size-6 place-items-center rounded-full text-xs font-medium", d === hoje && "bg-ring text-white")}>{Number(d.slice(8))}</span>
                      {dia.motivoSemAula && <CalendarOff className="size-3 text-muted-foreground" aria-label="Sem aula" />}
                    </span>
                    <span className="hidden flex-col gap-0.5 md:flex">
                      {itens.slice(0, 3).map((it) => (
                        <span key={it.chave} className={cn("truncate rounded px-1 text-[11px]", estiloItem(it.tipo))}>
                          {it.hora ? `${horaCurta(it.hora)} ` : ""}{it.titulo}
                        </span>
                      ))}
                      {itens.length > 3 && <span className="px-1 text-[11px] text-muted-foreground">+{itens.length - 3}</span>}
                    </span>
                    <span className="flex gap-0.5 md:hidden">
                      {itens.slice(0, 4).map((it) => <span key={it.chave} className={cn("size-1.5 rounded-full", ponto(it.tipo))} />)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Sheet open={!!diaAberto} onOpenChange={(o) => !o && setDiaAberto(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {diaAberto && (
            <DetalheDia dia={resolverDia(diaAberto, ctx)} ctx={ctx}
              onNovo={() => setEdicao({ evento: null, data: diaAberto })}
              onEditar={(e) => setEdicao({ evento: e, data: diaAberto })}
              onFeriado={async (ativo) => {
                try { await definirFeriadoAtivo(sb, diaAberto, ativo); toast.success(ativo ? "Feriado reativado." : "Dia volta a ter aula."); recarregar(); }
                catch (e) { toast.error((e as Error).message); }
              }} />
          )}
        </SheetContent>
      </Sheet>

      {edicao && (
        <DialogoEvento key={edicao.evento?.id ?? `novo-${edicao.data}`} evento={edicao.evento} dataInicial={edicao.data}
          onFechar={() => setEdicao(null)}
          onSalvar={async (d) => { await salvarEvento(sb, d, edicao.evento?.id); recarregar(); }}
          onExcluir={edicao.evento ? async () => { await excluirEvento(sb, edicao.evento!.id); recarregar(); } : undefined} />
      )}
    </>
  );
}

const estiloItem = (t: Item["tipo"]) => ({
  aula: "bg-secondary/70 text-foreground",
  compromisso: "bg-tag-tarde/15 text-tag-tarde",
  prazo: "bg-destructive/15 text-destructive",
  lembrete: "bg-minimo/15 text-minimo",
  excecao: "bg-secondary text-muted-foreground",
})[t];
const ponto = (t: Item["tipo"]) => ({ aula: "bg-muted-foreground/60", compromisso: "bg-tag-tarde", prazo: "bg-destructive", lembrete: "bg-minimo", excecao: "bg-muted-foreground" })[t];

function LinhaItem({ item, aviso, onAbrir }: { item: Item; aviso: boolean; onAbrir: () => void }) {
  const router = useRouter();
  const Icone = item.tipo === "prazo" ? CalendarClock : item.tipo === "lembrete" ? BellRing : item.tipo === "excecao" ? CalendarOff : item.tipo === "aula" ? GraduationCap : null;
  return (
    <li>
      <button type="button" onClick={() => (item.link ? router.push(item.link) : onAbrir())} disabled={item.freela && !item.link}
        style={item.cor ? { borderLeft: `3px solid ${item.cor}` } : undefined}
        className={cn("w-full rounded-md px-1.5 py-1 text-left text-xs hover:brightness-110 disabled:cursor-default", estiloItem(item.tipo))}>
        <span className="flex items-start gap-1">
          {Icone && <Icone className="mt-px size-3 shrink-0" aria-hidden />}
          {item.hora && <span className="numeros shrink-0 font-semibold">{horaCurta(item.hora)}</span>}
          <span className="line-clamp-2 font-medium">{item.titulo}</span>
        </span>
        {(item.detalhe || item.local) && (
          <span className="mt-0.5 block truncate opacity-80">
            {item.detalhe}{item.local && `, ${item.local}`}
          </span>
        )}
        {aviso && <span className="mt-0.5 flex items-center gap-1 text-aviso"><TriangleAlert className="size-3" aria-hidden />colide com cadeia</span>}
      </button>
    </li>
  );
}

function DetalheDia({ dia, ctx, onNovo, onEditar, onFeriado }: {
  dia: DiaResolvido; ctx: ContextoCompleto; onNovo: () => void; onEditar: (e: Evento) => void; onFeriado: (ativo: boolean) => void;
}) {
  const itens = itensDoDia(dia, ctx);
  const feriado = ctx.feriados.find((f) => f.data === dia.data);
  const nome = new Map(ctx.habitos.map((h) => [h.id, h.nome]));
  return (
    <>
      <SheetHeader>
        <SheetTitle>{dataPorExtenso(dia.data)}</SheetTitle>
        <SheetDescription>
          {dia.diaDeAula ? (dia.temAula ? "Dia com aula" : dia.motivoSemAula) : "Fim de semana"}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-6 px-4 pb-6">
        {feriado && dia.diaDeAula && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">Feriado: {feriado.nome}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {feriado.ativo ? "Tratado como dia sem aula." : "Desativado: este dia segue a rotina com aula."}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => onFeriado(!feriado.ativo)}>
              {feriado.ativo ? "Vou ter aula neste dia" : "Tratar como feriado de novo"}
            </Button>
          </div>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Agenda</h3>
          {itens.length === 0 ? <p className="text-sm text-muted-foreground">Nada marcado.</p> : (
            <ul className="space-y-1.5">
              {itens.map((it) => <LinhaItem key={it.chave} item={it} aviso={dia.avisos.some((a) => a.eventoId === it.evento?.id)} onAbrir={() => it.evento && !it.freela && onEditar(it.evento)} />)}
            </ul>
          )}
          {itens.some((i) => i.freela) && <p className="text-xs text-muted-foreground">Prazos de freela e avaliações são editados em <Link href="/freelas" className="underline">Freelas</Link> e <Link href="/faculdade" className="underline">Faculdade</Link>.</p>}
          <Button variant="outline" size="sm" onClick={onNovo}><Plus className="size-4" /> Evento neste dia</Button>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Hábitos do dia</h3>
          {dia.cadeias.length === 0 && dia.flexiveis.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma cadeia.</p>}
          <ul className="space-y-2">
            {dia.cadeias.map((c) => (
              <li key={c.id} className="flex gap-2.5 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: corDaCadeia(c) }} aria-hidden />
                <span><span className="font-medium">{c.nome}</span>
                  <span className="block text-xs text-muted-foreground">{c.passos.map((p) => nome.get(p.habitoId)).join(", ")}</span></span>
              </li>
            ))}
            {dia.flexiveis.length > 0 && (
              <li className="flex gap-2.5 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: COR_FLEXIVEL }} aria-hidden />
                <span><span className="font-medium">Flexíveis</span>
                  <span className="block text-xs text-muted-foreground">{dia.flexiveis.map((h) => h.nome).join(", ")}</span></span>
              </li>
            )}
          </ul>
          {dia.avisos.map((a) => (
            <p key={a.cadeiaId + a.eventoId} className="flex items-start gap-1.5 text-xs text-aviso"><TriangleAlert className="mt-px size-3.5 shrink-0" />{a.texto}</p>
          ))}
        </section>
      </div>
    </>
  );
}
