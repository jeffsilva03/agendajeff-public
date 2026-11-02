"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleDashed, Clock, Ellipsis, Minus, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { diasEntre, diasNoMes, fimDoMes, progressoMeta, type Meta, type SituacaoMeta, type TipoMeta } from "@motor";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { concluirMeta, definirProgresso, excluirMeta, salvarMeta, type DadosMeta } from "@/lib/mes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { nomeDoMes, type DadosMes } from "./tela-mes";

export const SITUACAO: Record<SituacaoMeta, { rotulo: string; classe: string; Icone: typeof Check }> = {
  concluida: { rotulo: "Concluída", classe: "text-feito bg-feito/12", Icone: Check },
  no_caminho: { rotulo: "No caminho", classe: "text-ring bg-ring/12", Icone: Target },
  atras: { rotulo: "Atrás do ritmo", classe: "text-aviso bg-aviso/12", Icone: Clock },
  sem_alvo: { rotulo: "Sem alvo", classe: "text-muted-foreground bg-secondary", Icone: CircleDashed },
  encerrada: { rotulo: "Mês encerrado", classe: "text-muted-foreground bg-secondary", Icone: CircleDashed },
};

/** Marco ainda não feito não tem ritmo: aparece como "A fazer". */
export const rotuloSituacao = (m: Meta, situacao: SituacaoMeta) =>
  m.tipo === "marco" && situacao === "no_caminho" ? { ...SITUACAO.sem_alvo, rotulo: "A fazer" } : SITUACAO[situacao];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

export function AbaMetas(d: DadosMes) {
  const router = useRouter();
  const sb = useMemo(() => criarClienteNavegador(), []);
  const [metas, setMetas] = useState(d.metas);
  const [editando, setEditando] = useState<Meta | "nova" | null>(null);
  const nomeHabito = new Map(d.ctx.habitos.map((h) => [h.id, h.nome]));
  const nomeArea = new Map(d.areas.map((a) => [a.id, a.nome]));
  const fim = fimDoMes(d.mes);
  const decorridos = d.hoje < d.mes ? 0 : d.hoje > fim ? diasNoMes(d.mes) : diasEntre(d.mes, d.hoje) + 1;
  const progresso = metas.map((m) => ({ m, p: progressoMeta(m, d.checks, d.hoje) }));
  // Marco ainda não feito não conta como "no caminho" (ele não tem ritmo).
  const conta = (s: SituacaoMeta) => progresso.filter((x) => x.p.situacao === s && !(s === "no_caminho" && x.m.tipo === "marco")).length;

  async function agir(f: () => Promise<unknown>, otimista?: (l: Meta[]) => Meta[], ok?: string) {
    const antes = metas;
    if (otimista) setMetas(otimista);
    try { await f(); if (ok) toast.success(ok); router.refresh(); }
    catch (e) { setMetas(antes); toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-6">
      <section aria-label="Resumo das metas" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        {[
          ["Metas", String(metas.length)],
          ["Concluídas", String(conta("concluida"))],
          ["No caminho", String(conta("no_caminho"))],
          ["Atrás do ritmo", String(conta("atras"))],
        ].map(([r, v]) => (
          <div key={r} className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{r}</p>
            <p className="numeros mt-1 text-2xl font-semibold">{v}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="numeros text-sm text-muted-foreground">
          {d.hoje < d.mes ? "O mês ainda não começou." : d.hoje > fim ? "Mês encerrado." : `Dia ${decorridos} de ${diasNoMes(d.mes)}.`}
          {" "}O ritmo esperado é proporcional aos dias que passaram.
        </p>
        <Button size="sm" onClick={() => setEditando("nova")}><Plus className="size-4" /> Meta</Button>
      </div>

      {metas.length === 0 ? (
        <div className="rounded-xl border border-dashed px-5 py-10 text-center">
          <Target className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">Nenhuma meta para {nomeDoMes(d.mes)}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Crie uma meta com alvo (ex.: 4 livros), ligada a um hábito (dias praticados no mês) ou um marco único. Também dá para gerar as metas a partir do foco do mês no <Link href={`/mes?aba=raiox${d.mes.slice(0, 7) !== d.hoje.slice(0, 7) ? `&mes=${d.mes.slice(0, 7)}` : ""}`} className="underline underline-offset-2">Raio-X</Link>.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {progresso.map(({ m, p }) => {
            const s = rotuloSituacao(m, p.situacao);
            return (
              <li key={m.id} data-meta className="rounded-xl border bg-card p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium leading-snug">{m.titulo}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium", s.classe)}><s.Icone className="size-3" aria-hidden />{s.rotulo}</span>
                      {m.areaId && nomeArea.get(m.areaId) && <span className="rounded border px-1.5 py-0.5">{nomeArea.get(m.areaId)}</span>}
                      {m.tipo === "habito" && m.habitoId && <span>Hábito: {nomeHabito.get(m.habitoId) ?? "arquivado"}</span>}
                      {m.origem === "raiox" && <span>do Raio-X</span>}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label={`Mais opções para a meta ${m.titulo}`} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"><Ellipsis className="size-4" /></button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditando(m)}><Pencil /> Editar</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onSelect={() => confirm(`Excluir a meta "${m.titulo}"?`) && agir(() => excluirMeta(sb, m.id), (l) => l.filter((x) => x.id !== m.id), "Meta excluída.")}><Trash2 /> Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {m.tipo === "marco" ? (
                  <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-[var(--feito)]" checked={!!m.concluidaEm}
                      onChange={(e) => agir(() => concluirMeta(sb, m.id, e.target.checked), (l) => l.map((x) => (x.id === m.id ? { ...x, concluidaEm: e.target.checked ? new Date().toISOString() : null } : x)))} />
                    {m.concluidaEm ? "Feito" : "Marcar como feito"}
                  </label>
                ) : (
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="numeros"><strong className="text-base">{fmt(p.atual)}</strong>{p.alvo !== null && <> de {fmt(p.alvo)}</>} {m.unidade ?? ""}</span>
                      {p.pct !== null && <span className="numeros text-xs text-muted-foreground">{Math.round(p.pct * 100)}%</span>}
                    </div>
                    {p.alvo !== null && (
                      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label={`Progresso de ${m.titulo}`}
                        aria-valuemin={0} aria-valuemax={p.alvo} aria-valuenow={p.atual}>
                        <div className={cn("h-full rounded-full", p.situacao === "atras" ? "bg-aviso" : "bg-feito")} style={{ width: `${(p.pct ?? 0) * 100}%` }} />
                        {p.esperado !== null && p.situacao !== "concluida" && (
                          <span aria-hidden title="Ritmo esperado hoje" className="absolute inset-y-0 w-0.5 bg-foreground/50" style={{ left: `${Math.min(100, (p.esperado / p.alvo) * 100)}%` }} />
                        )}
                      </div>
                    )}
                    {m.tipo === "contagem" ? (
                      <div className="mt-3 flex items-center gap-2">
                        <Button variant="outline" size="sm" className="size-8 px-0" aria-label={`Diminuir ${m.titulo}`} disabled={m.progresso <= 0}
                          onClick={() => agir(() => definirProgresso(sb, m.id, m.progresso - 1), (l) => l.map((x) => (x.id === m.id ? { ...x, progresso: Math.max(0, x.progresso - 1) } : x)))}><Minus className="size-4" /></Button>
                        <Button variant="outline" size="sm" className="size-8 px-0" aria-label={`Aumentar ${m.titulo}`}
                          onClick={() => agir(() => definirProgresso(sb, m.id, m.progresso + 1), (l) => l.map((x) => (x.id === m.id ? { ...x, progresso: x.progresso + 1 } : x)))}><Plus className="size-4" /></Button>
                        {p.esperado !== null && p.situacao !== "concluida" && p.situacao !== "encerrada" && (
                          <span className="numeros text-xs text-muted-foreground">ritmo de hoje: {fmt(Math.round(p.esperado * 10) / 10)}</span>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Conta sozinho os dias do mês com o hábito feito ou no mínimo.</p>
                    )}
                  </div>
                )}
                {m.comoMedir && <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">Como medir: {m.comoMedir}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {editando && (
        <DialogoMeta meta={editando === "nova" ? null : editando} habitos={d.ctx.habitos} areas={d.areas}
          onFechar={() => setEditando(null)}
          onSalvar={async (dados) => {
            await salvarMeta(sb, d.mes, dados, editando === "nova" ? undefined : editando.id);
            toast.success(editando === "nova" ? "Meta criada." : "Meta salva.");
            setEditando(null);
            router.refresh();
          }} />
      )}
    </div>
  );
}

function DialogoMeta({ meta, habitos, areas, onFechar, onSalvar }: {
  meta: Meta | null; habitos: { id: string; nome: string }[]; areas: { id: string; nome: string }[];
  onFechar: () => void; onSalvar: (d: DadosMeta) => Promise<void>;
}) {
  const [d, setD] = useState<DadosMeta>({
    titulo: meta?.titulo ?? "", tipo: meta?.tipo ?? "contagem", alvo: meta?.alvo ?? null, unidade: meta?.unidade ?? "",
    habitoId: meta?.habitoId ?? null, areaId: meta?.areaId ?? null, comoMedir: meta?.comoMedir ?? "",
  });
  const [ocupado, setOcupado] = useState(false);
  const TIPOS: { id: TipoMeta; rotulo: string; dica: string }[] = [
    { id: "contagem", rotulo: "Número", dica: "Você soma à mão (ex.: 4 livros, 8 treinos)." },
    { id: "habito", rotulo: "Hábito", dica: "Conta sozinho os dias do mês com o hábito feito." },
    { id: "marco", rotulo: "Marco", dica: "Uma coisa só, feita ou não (ex.: entregar o TCC)." },
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{meta ? "Editar meta" : "Nova meta do mês"}</DialogTitle>
          <DialogDescription>Uma meta boa é concreta e dá para medir no fim do mês.</DialogDescription>
        </DialogHeader>
        <form id="form-meta" className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!d.titulo.trim()) return toast.error("Dê um título para a meta.");
          if (d.tipo !== "marco" && !(Number(d.alvo) > 0)) return toast.error("Informe um alvo maior que zero.");
          if (d.tipo === "habito" && !d.habitoId) return toast.error("Escolha o hábito.");
          setOcupado(true);
          try { await onSalvar({ ...d, alvo: d.tipo === "marco" ? null : Number(d.alvo) }); }
          catch (err) { toast.error((err as Error).message); setOcupado(false); }
        }}>
          <div className="space-y-1.5"><Label htmlFor="m-titulo" className="text-[13px]">Meta</Label>
            <Input id="m-titulo" value={d.titulo} onChange={(e) => setD({ ...d, titulo: e.target.value })} placeholder="Ex.: Ler 2 livros" maxLength={120} autoFocus /></div>
          <div className="space-y-1.5">
            <span className="text-[13px] font-medium">Tipo</span>
            <div role="radiogroup" aria-label="Tipo de meta" className="grid grid-cols-3 gap-1.5">
              {TIPOS.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={d.tipo === t.id} onClick={() => setD({ ...d, tipo: t.id })}
                  className={cn("rounded-md border px-2 py-2 text-sm", d.tipo === t.id ? "border-ring bg-ring/10 font-medium" : "text-muted-foreground hover:bg-accent")}>{t.rotulo}</button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{TIPOS.find((t) => t.id === d.tipo)!.dica}</p>
          </div>
          {d.tipo === "habito" && (
            <div className="space-y-1.5"><Label className="text-[13px]">Hábito</Label>
              <Select value={d.habitoId ?? undefined} onValueChange={(v) => setD({ ...d, habitoId: v })}>
                <SelectTrigger aria-label="Hábito da meta"><SelectValue placeholder="Escolha um hábito" /></SelectTrigger>
                <SelectContent>{habitos.map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}</SelectContent>
              </Select></div>
          )}
          {d.tipo !== "marco" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="m-alvo" className="text-[13px]">{d.tipo === "habito" ? "Dias no mês" : "Alvo"}</Label>
                <Input id="m-alvo" inputMode="decimal" value={d.alvo ?? ""} onChange={(e) => setD({ ...d, alvo: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })} placeholder="Ex.: 4" /></div>
              {d.tipo === "contagem" && (
                <div className="space-y-1.5"><Label htmlFor="m-unidade" className="text-[13px]">Unidade</Label>
                  <Input id="m-unidade" value={d.unidade ?? ""} onChange={(e) => setD({ ...d, unidade: e.target.value })} placeholder="Ex.: livros" maxLength={30} /></div>
              )}
            </div>
          )}
          <div className="space-y-1.5"><Label className="text-[13px]">Área da vida (opcional)</Label>
            <Select value={d.areaId ?? "nenhuma"} onValueChange={(v) => setD({ ...d, areaId: v === "nenhuma" ? null : v })}>
              <SelectTrigger aria-label="Área da meta"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Nenhuma</SelectItem>
                {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
              </SelectContent>
            </Select></div>
          <div className="space-y-1.5"><Label htmlFor="m-medir" className="text-[13px]">Como vou medir (opcional)</Label>
            <Textarea id="m-medir" rows={2} value={d.comoMedir ?? ""} onChange={(e) => setD({ ...d, comoMedir: e.target.value })} placeholder="Ex.: anotar no app cada livro terminado" /></div>
        </form>
        <DialogFooter><Button type="submit" form="form-meta" disabled={ocupado}>{meta ? "Salvar" : "Criar meta"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
