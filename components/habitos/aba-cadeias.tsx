"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowRightLeft, ArrowUp, Ellipsis, GripVertical, Pencil, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { horaCurta, type Cadeia, type Passo } from "@motor";
import type { ContextoCompleto } from "@/lib/dados";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { adicionarFlexivel, adicionarPasso, atualizarPasso, criarHabito, desativarCadeia, moverPasso, removerFlexivel, removerPasso, reordenarPassos, salvarCadeia, trocarOrdemCadeias, type ContextoFlex } from "@/lib/mutacoes";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { COR_FLEXIVEL, corDaCadeia, rotuloDias } from "@/lib/apresentacao";
import { Button } from "@/components/ui/button";
import { DialogoCadeia, DialogoPasso } from "./formularios";

const aDefinir = (s: string | null | undefined) => !s || /a definir/i.test(s);
type EdicaoPasso = { cadeia: Cadeia; passo: Passo | null; habitoInicial?: string } | null;
type EdicaoCadeia = { cadeia: Cadeia | null } | null;

export function AbaCadeias({ ctx, novaCadeia, onNovaCadeiaFechar }: { ctx: ContextoCompleto; novaCadeia: boolean; onNovaCadeiaFechar: () => void }) {
  const router = useRouter();
  const sb = criarClienteNavegador();
  const [ordens, setOrdens] = useState<Record<string, string[]>>({});
  const [edPasso, setEdPasso] = useState<EdicaoPasso>(null);
  const [edCadeia, setEdCadeia] = useState<EdicaoCadeia>(null);
  const nome = new Map(ctx.habitos.map((h) => [h.id, h.nome]));
  const emCadeia = new Set(ctx.cadeias.flatMap((c) => c.passos.map((p) => p.habitoId)));
  const flex = (contexto: string) => ctx.regrasFlex.find((r) => r.contexto === contexto)?.habitoIds ?? [];
  const soltos = ctx.habitos.filter((h) => !emCadeia.has(h.id) && !ctx.regrasFlex.some((r) => r.habitoIds.includes(h.id)));

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const passosDe = (c: Cadeia) => {
    const ordem = ordens[c.id];
    if (!ordem) return c.passos;
    const m = new Map(c.passos.map((p) => [p.id, p]));
    return ordem.map((id) => m.get(id)).filter((p): p is Passo => !!p);
  };

  async function mexerFlex(f: () => Promise<void>) {
    try { await f(); router.refresh(); } catch (e) { toast.error((e as Error).message); }
  }

  async function agir(f: () => Promise<void>, ok?: string) {
    try { await f(); if (ok) toast.success(ok); setOrdens({}); router.refresh(); } catch (e) { toast.error((e as Error).message); }
  }

  /** Move um passo para outra cadeia, mantendo gatilho e mínimo. */
  const mover = (origem: Cadeia, p: Passo, destino: Cadeia) => agir(
    () => moverPasso(sb, p.id, origem.id, destino.id, passosDe(origem).filter((x) => x.id !== p.id).map((x) => x.id)),
    `${nome.get(p.habitoId)} agora está em ${destino.nome}.`,
  );

  async function aoSoltar(c: Cadeia, e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const atual = passosDe(c).map((p) => p.id);
    const nova = arrayMove(atual, atual.indexOf(String(e.active.id)), atual.indexOf(String(e.over.id)));
    setOrdens((o) => ({ ...o, [c.id]: nova }));
    try {
      await reordenarPassos(sb, c.id, nova);
      router.refresh();
    } catch (err) {
      setOrdens((o) => ({ ...o, [c.id]: atual }));
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 lg:grid-cols-2">
        {ctx.cadeias.map((c, ic) => {
          const passos = passosDe(c);
          const anterior = ctx.cadeias[ic - 1], seguinte = ctx.cadeias[ic + 1];
          const cor = corDaCadeia(c);
          return (
            <section key={c.id} aria-labelledby={`c-${c.id}`} className="overflow-hidden rounded-xl border bg-card">
              <header className="flex items-start gap-3 border-b px-4 py-3">
                <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ background: cor }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <h3 id={`c-${c.id}`} className="text-[15px] font-semibold">{c.nome}</h3>
                  <p className="numeros mt-0.5 text-xs text-muted-foreground">
                    {rotuloDias(c.diasSemana)}
                    {c.janelaInicio && c.janelaFim && `, ${horaCurta(c.janelaInicio)}–${horaCurta(c.janelaFim)}`}
                    {c.dependeAula && ", só com aula"}
                    {!c.lembrete && ", sem lembrete"}
                  </p>
                  <p className={aDefinir(c.ancora) ? "mt-1 flex items-center gap-1 text-xs text-aviso" : "mt-1 text-xs text-muted-foreground"}>
                    {aDefinir(c.ancora) && <TriangleAlert className="size-3.5" aria-hidden />}
                    Âncora: {aDefinir(c.ancora) ? "a definir, complete esta cadeia" : c.ancora}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon" aria-label={`Subir cadeia ${c.nome}`} title="Subir (vem antes no dia)" disabled={!anterior}
                    onClick={() => anterior && agir(() => trocarOrdemCadeias(sb, { id: c.id, ordem: c.ordem }, { id: anterior.id, ordem: anterior.ordem }))}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Descer cadeia ${c.nome}`} title="Descer (vem depois no dia)" disabled={!seguinte}
                    onClick={() => seguinte && agir(() => trocarOrdemCadeias(sb, { id: c.id, ordem: c.ordem }, { id: seguinte.id, ordem: seguinte.ordem }))}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Editar cadeia ${c.nome}`} onClick={() => setEdCadeia({ cadeia: c })}>
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </header>

              <DndContext id={`cadeia-${c.id}`} sensors={sensores} collisionDetection={closestCenter} onDragEnd={(e) => aoSoltar(c, e)}>
                <SortableContext items={passos.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                  <ol className="divide-y">
                    {passos.map((p, i) => (
                      <LinhaPasso key={p.id} passo={p} indice={i + 1} nome={nome.get(p.habitoId) ?? "Hábito"}
                        destinos={ctx.cadeias.filter((d) => d.id !== c.id)}
                        onMover={(d) => mover(c, p, d)}
                        onEditar={() => setEdPasso({ cadeia: c, passo: p })}
                        onRemover={async () => {
                          if (!confirm(`Tirar "${nome.get(p.habitoId)}" da cadeia ${c.nome}? O hábito e o histórico continuam.`)) return;
                          try {
                            await removerPasso(sb, c.id, p.id, passos.filter((x) => x.id !== p.id).map((x) => x.id));
                            setOrdens((o) => { const n = { ...o }; delete n[c.id]; return n; });
                            toast.success("Passo removido.");
                            router.refresh();
                          } catch (err) { toast.error((err as Error).message); }
                        }} />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
              {passos.length === 0 && <p className="px-4 py-5 text-sm text-muted-foreground">Cadeia sem passos. Adicione o primeiro hábito.</p>}
              <button type="button" onClick={() => setEdPasso({ cadeia: c, passo: null })}
                className="flex w-full items-center gap-2 border-t px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                <Plus className="size-4" aria-hidden /> Adicionar passo
              </button>
            </section>
          );
        })}
      </div>

      <section aria-labelledby="t-flex" className="rounded-xl border bg-card p-4">
        <h3 id="t-flex" className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="size-2 rounded-full" style={{ background: COR_FLEXIVEL }} aria-hidden /> Flexíveis do dia
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Sem gatilho nem horário. Aparecem no dia e contam na adesão.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {([["dia_util_sem_aula", "Dia útil sem aula", "Além destes, os hábitos das cadeias que dependem de aula."], ["fim_de_semana", "Fim de semana", null]] as const).map(([contexto, rotulo, nota]) => {
            const ids = flex(contexto);
            const disponiveis = ctx.habitos.filter((h) => !ids.includes(h.id));
            return (
              <div key={contexto}>
                <p className="text-xs text-muted-foreground">{rotulo}</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {ids.map((id) => (
                    <li key={id} className="flex items-center gap-1 rounded-md border py-0.5 pr-1 pl-2 text-sm">
                      {nome.get(id)}
                      <button type="button" aria-label={`Tirar ${nome.get(id)} dos flexíveis de ${rotulo.toLowerCase()}`}
                        className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                        onClick={() => mexerFlex(() => removerFlexivel(sb, contexto as ContextoFlex, id))}>
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                  {ids.length === 0 && <li className="text-sm text-muted-foreground">nenhum</li>}
                </ul>
                {disponiveis.length > 0 && (
                  <select aria-label={`Adicionar flexível em ${rotulo.toLowerCase()}`} value="" className="mt-2 h-8 rounded-md border bg-transparent px-2 text-sm text-muted-foreground"
                    onChange={(e) => e.target.value && mexerFlex(() => adicionarFlexivel(sb, contexto as ContextoFlex, e.target.value))}>
                    <option value="">+ Adicionar hábito</option>
                    {disponiveis.map((h) => <option key={h.id} value={h.id}>{h.nome}</option>)}
                  </select>
                )}
                {nota && <p className="mt-1.5 text-xs text-muted-foreground">{nota}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {soltos.length > 0 && (
        <section aria-labelledby="t-soltos" className="rounded-xl border bg-card p-4">
          <h3 id="t-soltos" className="text-[15px] font-semibold">Fora de cadeia</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Não aparecem no Hoje até entrarem numa cadeia.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {soltos.map((h) => (
              <li key={h.id} className="flex items-center gap-1 rounded-md border py-0.5 pr-1 pl-2.5 text-sm">
                {h.nome}
                <select aria-label={`Colocar ${h.nome} em uma cadeia`} value="" className="h-7 rounded border-0 bg-transparent px-1 text-xs text-muted-foreground"
                  onChange={(e) => { const c = ctx.cadeias.find((x) => x.id === e.target.value); if (c) setEdPasso({ cadeia: c, passo: null, habitoInicial: h.id }); }}>
                  <option value="">Colocar em…</option>
                  {ctx.cadeias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}

      {edPasso && (
        <DialogoPasso key={edPasso.passo?.id ?? `novo-${edPasso.cadeia.id}-${edPasso.habitoInicial ?? ""}`} aberto onFechar={() => setEdPasso(null)}
          cadeia={edPasso.cadeia} passo={edPasso.passo} habitos={ctx.habitos} cadeias={ctx.cadeias} habitoInicial={edPasso.habitoInicial}
          onSalvar={async (d) => {
            if (edPasso.passo) {
              await atualizarPasso(sb, edPasso.passo.id, { gatilho: d.gatilho, minimo: d.minimo, completo: d.completo, naoAntes: d.naoAntes || null });
              if (d.cadeiaId && d.cadeiaId !== edPasso.cadeia.id) {
                await moverPasso(sb, edPasso.passo.id, edPasso.cadeia.id, d.cadeiaId, passosDe(edPasso.cadeia).filter((x) => x.id !== edPasso.passo!.id).map((x) => x.id));
              }
            } else {
              const habitoId = d.habitoId ?? (await criarHabito(sb, d.novoNome!));
              await adicionarPasso(sb, edPasso.cadeia.id, { habitoId, gatilho: d.gatilho, minimo: d.minimo, completo: d.completo, naoAntes: d.naoAntes || null });
            }
            setOrdens((o) => { const n = { ...o }; delete n[edPasso.cadeia.id]; return n; });
            router.refresh();
          }} />
      )}
      {(edCadeia || novaCadeia) && (
        <DialogoCadeia key={edCadeia?.cadeia?.id ?? "nova"} aberto cadeia={edCadeia?.cadeia ?? null}
          onFechar={() => { setEdCadeia(null); onNovaCadeiaFechar(); }}
          onSalvar={async (d) => { await salvarCadeia(sb, d, edCadeia?.cadeia?.id); router.refresh(); }}
          onRemover={edCadeia?.cadeia ? async () => { await desativarCadeia(sb, edCadeia.cadeia!.id); router.refresh(); } : undefined} />
      )}
    </div>
  );
}

function LinhaPasso({ passo, indice, nome, destinos, onEditar, onMover, onRemover }: {
  passo: Passo; indice: number; nome: string; destinos: Cadeia[]; onEditar: () => void; onMover: (destino: Cadeia) => void; onRemover: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: passo.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative flex items-center gap-2 bg-card px-2 py-2.5 ${isDragging ? "z-10 shadow-lg ring-1 ring-ring/40" : ""}`}>
      <button type="button" ref={setActivatorNodeRef} {...listeners} {...attributes} aria-label={`Reordenar ${nome}`}
        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-accent active:cursor-grabbing">
        <GripVertical className="size-4" />
      </button>
      <span className="numeros w-4 shrink-0 text-xs text-muted-foreground">{indice}</span>
      <button type="button" onClick={onEditar} className="min-w-0 flex-1 rounded-md py-0.5 text-left">
        <span className="block truncate text-sm font-medium">{nome}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {aDefinir(passo.gatilho) ? <span className="text-aviso">gatilho a definir</span> : passo.gatilho.replace(/\s*\(.*\)$/, "")}
          {passo.naoAntes && `, a partir de ${horaCurta(passo.naoAntes)}`}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          <span className="text-minimo">mín.</span> {passo.minimo ?? <span className="text-aviso">a definir</span>}
          {passo.completo ? <> <span aria-hidden>·</span> completo: {passo.completo}</> : <span className="text-muted-foreground/60"> · completo não definido</span>}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Mais opções para ${nome}`} className="text-muted-foreground"><Ellipsis className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={onEditar}><Pencil /> Editar passo</DropdownMenuItem>
          {destinos.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground"><ArrowRightLeft className="size-3.5" /> Mover para</DropdownMenuLabel>
              {destinos.map((d) => {
                const jaEsta = d.passos.some((x) => x.habitoId === passo.habitoId);
                return (
                  <DropdownMenuItem key={d.id} disabled={jaEsta} onSelect={() => onMover(d)}>
                    <span className="min-w-0 flex-1 truncate">{d.nome}</span>
                    <span className="numeros text-xs text-muted-foreground">{jaEsta ? "já está" : d.janelaInicio && d.janelaFim ? `${horaCurta(d.janelaInicio)}–${horaCurta(d.janelaFim)}` : ""}</span>
                  </DropdownMenuItem>
                );
              })}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onSelect={onRemover}><Trash2 /> Tirar da cadeia</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
