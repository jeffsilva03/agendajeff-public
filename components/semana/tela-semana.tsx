"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CalendarOff, Check, GraduationCap, Lightbulb, ListTodo, Plus, Repeat, Target, TriangleAlert } from "lucide-react";
import {
  descreverRecorrencia, horaCurta, recorrenciaVale, resolverDia, revisaoSemanal, somarDias, type Check as CheckMotor, type Recorrencia,
} from "@motor";
import type { ContextoCompleto } from "@/lib/dados";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { definirFocoDaSemana } from "@/lib/mutacoes";
import { fazerOuEnfileirar, novoId } from "@/lib/fila-tarefas";
import { dataPorExtenso, diaMes } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cabecalho } from "@/components/app/cabecalho";

interface TarefaSemana { id: string; titulo: string; data: string; hora: string | null; prioridade: number; concluida: boolean; recorrente: boolean }

const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function Passo({ n, titulo, descricao, children }: { n: number; titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`p-${n}`} className="grid gap-4 border-b py-7 last:border-0 lg:grid-cols-[15rem_1fr] lg:gap-8">
      <div>
        <p className="numeros text-xs text-muted-foreground">Passo {n} de 4</p>
        <h2 id={`p-${n}`} className="mt-0.5 text-[15px] font-semibold">{titulo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function TelaSemana({ ctx, checks, hoje, de, ate, tarefas: iniciais, recorrentes, focoAtual }: {
  ctx: ContextoCompleto; checks: CheckMotor[]; hoje: string; de: string; ate: string;
  tarefas: TarefaSemana[]; recorrentes: Recorrencia[]; focoAtual: string | null;
}) {
  const router = useRouter();
  const sb = criarClienteNavegador();
  const [tarefas, setTarefas] = useState(iniciais);
  const [foco, setFoco] = useState(focoAtual);
  const [diaNova, setDiaNova] = useState(de);
  const [titulo, setTitulo] = useState("");

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => somarDias(de, i)), [de]);
  const resolvidos = useMemo(() => new Map(dias.map((d) => [d, resolverDia(d, ctx)])), [dias, ctx]);
  const minimos = useMemo(() => new Map(ctx.cadeias.flatMap((c) => c.passos.map((p) => [p.habitoId, p.minimo] as [string, string | null]))), [ctx.cadeias]);
  const revisao = useMemo(() => revisaoSemanal(ctx, checks, hoje, minimos), [ctx, checks, hoje, minimos]);
  const nome = new Map(ctx.habitos.map((h) => [h.id, h.nome]));
  const habitosNaSemana = ctx.habitos.filter((h) => dias.some((d) => {
    const r = resolvidos.get(d)!;
    return r.cadeias.some((c) => c.passos.some((p) => p.habitoId === h.id)) || r.flexiveis.some((f) => f.id === h.id);
  }));

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const t = titulo.trim();
    if (!t) return;
    const id = novoId();
    setTarefas((l) => [...l, { id, titulo: t, data: diaNova, hora: null, prioridade: 0, concluida: false, recorrente: false }]);
    setTitulo("");
    try {
      const r = await fazerOuEnfileirar(sb, { acao: "criar", id, linha: { titulo: t, data: diaNova, hora: null, notas: null, prioridade: 0 }, em: new Date().toISOString() });
      toast.success(r === "fila" ? "Sem sinal: guardada no aparelho." : `Tarefa para ${DIA_CURTO[resolvidos.get(diaNova)!.diaSemana]}, ${diaMes(diaNova)}.`);
    } catch (err) {
      setTarefas((l) => l.filter((x) => x.id !== id));
      toast.error((err as Error).message);
    }
  }

  async function escolherFoco(habitoId: string | null) {
    const antes = foco;
    setFoco(habitoId);
    try {
      await definirFocoDaSemana(sb, habitoId, de);
      toast.success(habitoId ? `Foco da semana: ${nome.get(habitoId)}. Ele aparece destacado no Hoje.` : "Foco da semana removido.");
      router.refresh();
    } catch (e) { setFoco(antes); toast.error((e as Error).message); }
  }

  const prazosDaSemana = dias.flatMap((d) => resolvidos.get(d)!.prazos.filter((p) => p.tipo === "prazo"));
  const aulasDaSemana = dias.reduce((n, d) => n + resolvidos.get(d)!.aulas.length, 0);

  return (
    <>
      <Cabecalho titulo="Planejar a semana">
        <span className="numeros">{dataPorExtenso(de)} a {dataPorExtenso(ate).toLowerCase()}. Uns 10 minutos, de preferência no sábado de manhã.</span>
      </Cabecalho>
      <div className="max-w-5xl px-4 pb-16 md:px-8">

        <Passo n={1} titulo="Como foi" descricao="Os últimos 7 dias, com uma sugestão para a próxima semana.">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="numeros text-sm text-muted-foreground">{diaMes(revisao.de)} a {diaMes(revisao.ate)}</p>
              <p className="numeros"><span className="text-2xl font-semibold">{pct(revisao.adesao)}</span> <span className="text-xs text-muted-foreground">{revisao.total ? `${revisao.feitos} de ${revisao.total} hábitos-dia` : "sem registros"}</span></p>
            </div>
            <p className={cn("mt-3 flex gap-2 rounded-lg p-3 text-sm", revisao.sugestao.tipo === "sem_dados" ? "bg-secondary/50 text-muted-foreground" : "bg-minimo/[0.07]")}>
              <Lightbulb className={cn("mt-0.5 size-4 shrink-0", revisao.sugestao.tipo !== "sem_dados" && "text-minimo")} aria-hidden />
              {revisao.sugestao.texto}
            </p>
            {revisao.porHabito.length > 0 && (
              <ul className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                {[...revisao.porHabito].sort((a, b) => (a.adesao ?? 0) - (b.adesao ?? 0)).map((h) => (
                  <li key={h.habitoId} className="flex justify-between gap-2"><span className="truncate">{nome.get(h.habitoId)}</span><span className="numeros text-muted-foreground">{h.feitos}/{h.total}</span></li>
                ))}
              </ul>
            )}
          </div>
        </Passo>

        <Passo n={2} titulo="O que vem aí" descricao={`${aulasDaSemana} aulas, ${prazosDaSemana.length} ${prazosDaSemana.length === 1 ? "prazo" : "prazos"} e os compromissos da semana.`}>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {dias.map((d) => {
              const r = resolvidos.get(d)!;
              const prazos = r.prazos.filter((p) => p.tipo === "prazo");
              const lembretes = r.prazos.filter((p) => p.tipo === "lembrete");
              const vazio = !r.aulas.length && !r.compromissos.length && !r.prazos.length && !r.motivoSemAula;
              return (
                <li key={d} className="rounded-xl border bg-card p-3 text-sm">
                  <p className="flex items-baseline gap-2"><span className="text-xs text-muted-foreground">{DIA_CURTO[r.diaSemana]}</span><span className="numeros font-semibold">{diaMes(d)}</span></p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {r.motivoSemAula && <li className="flex items-center gap-1.5 text-muted-foreground"><CalendarOff className="size-3.5" aria-hidden />{r.motivoSemAula}</li>}
                    {r.aulas.length > 0 && <li className="flex items-center gap-1.5 text-muted-foreground"><GraduationCap className="size-3.5" aria-hidden />{r.aulas.map((a) => a.disciplina).join(", ")}</li>}
                    {r.compromissos.map((c) => <li key={c.id} className="flex gap-1.5"><span className="numeros shrink-0 font-medium">{c.inicio ? horaCurta(c.inicio) : "dia"}</span><span className="truncate">{c.titulo}</span></li>)}
                    {prazos.map((p) => <li key={p.eventoId} className="flex items-start gap-1.5 text-destructive"><CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden /><span>{p.titulo.replace(/^Prazo: /, "")}</span></li>)}
                    {lembretes.length > 0 && <li className="text-muted-foreground">{lembretes.length} {lembretes.length === 1 ? "lembrete" : "lembretes"} de prazo</li>}
                    {r.avisos.length > 0 && <li className="flex items-center gap-1.5 text-aviso"><TriangleAlert className="size-3.5" aria-hidden />{r.avisos.length} {r.avisos.length === 1 ? "colisão" : "colisões"} com cadeias</li>}
                    {vazio && <li className="text-muted-foreground">Rotina normal.</li>}
                  </ul>
                </li>
              );
            })}
          </ol>
        </Passo>

        <Passo n={3} titulo="Tarefas por dia" descricao="Distribua o que precisa ser feito. As recorrentes aparecem sozinhas.">
          <form onSubmit={adicionar} className="flex flex-col gap-2 sm:flex-row">
            <div role="radiogroup" aria-label="Dia da tarefa" className="flex gap-1 overflow-x-auto">
              {dias.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={diaNova === d} onClick={() => setDiaNova(d)}
                  className={cn("h-9 shrink-0 rounded-md border px-2.5 text-sm", diaNova === d ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>
                  {DIA_CURTO[resolvidos.get(d)!.diaSemana]}
                </button>
              ))}
            </div>
            <Input aria-label="Nova tarefa da semana" placeholder="Ex.: Estudar para a P1" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-9 flex-1" />
            <Button type="submit" size="sm" className="h-9"><Plus className="size-4" /> Adicionar</Button>
          </form>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {dias.map((d) => {
              const doDia = tarefas.filter((t) => t.data === d);
              const recs = recorrentes.filter((r) => recorrenciaVale(r, d) && !doDia.some((t) => t.recorrente && t.titulo === r.titulo));
              return (
                <li key={d} className="rounded-xl border bg-coluna p-2.5">
                  <p className="numeros px-0.5 text-xs font-medium text-muted-foreground">{DIA_CURTO[resolvidos.get(d)!.diaSemana]}, {diaMes(d)}</p>
                  <ul className="mt-1.5 space-y-1">
                    {doDia.map((t) => (
                      <li key={t.id} className={cn("flex items-center gap-1.5 rounded-md bg-card px-2 py-1.5 text-xs", t.concluida && "text-muted-foreground line-through")}>
                        {t.concluida ? <Check className="size-3 shrink-0 text-feito" aria-hidden /> : <ListTodo className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
                        <span className="truncate">{t.titulo}</span>
                        {t.hora && <span className="numeros ml-auto shrink-0 text-muted-foreground">{horaCurta(t.hora)}</span>}
                      </li>
                    ))}
                    {recs.map((r) => (
                      <li key={r.id} className="flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground" title={`Repete: ${descreverRecorrencia(r)}`}>
                        <Repeat className="size-3 shrink-0" aria-hidden /><span className="truncate">{r.titulo}</span>
                      </li>
                    ))}
                    {!doDia.length && !recs.length && <li className="px-0.5 py-1 text-xs text-muted-foreground/70">Livre</li>}
                  </ul>
                </li>
              );
            })}
          </ol>
        </Passo>

        <Passo n={4} titulo="Foco da semana" descricao="Um hábito para dar atenção extra. Ele aparece destacado no Hoje durante a semana.">
          <ul className="grid gap-2 sm:grid-cols-2">
            {habitosNaSemana.map((h) => {
              const r = revisao.porHabito.find((x) => x.habitoId === h.id);
              const sugerido = revisao.sugestao.habitoId === h.id;
              return (
                <li key={h.id}>
                  <button type="button" aria-pressed={foco === h.id} onClick={() => escolherFoco(foco === h.id ? null : h.id)}
                    className={cn("flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left text-sm hover:border-input", foco === h.id && "border-ring ring-1 ring-ring/40")}>
                    <Target className={cn("size-4 shrink-0", foco === h.id ? "text-ring" : "text-muted-foreground/50")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{h.nome}</span>
                      <span className="numeros text-xs text-muted-foreground">{r ? `${r.feitos} de ${r.total} na última semana` : "sem registros na última semana"}{sugerido ? ", sugerido" : ""}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild><Link href="/hoje">Pronto, ir para o Hoje</Link></Button>
            <span className="text-xs text-muted-foreground">Tudo já está salvo conforme você mexe.</span>
          </div>
        </Passo>
      </div>
    </>
  );
}
