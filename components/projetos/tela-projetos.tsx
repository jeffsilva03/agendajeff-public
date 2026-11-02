"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, CalendarClock, FolderKanban, Lightbulb, Pin, Plus, Search } from "lucide-react";
import { diasEntre } from "@motor";
import {
  CATEGORIA_PROJETO, desdeStatus, FILTROS, haQuanto, ORDEM_STATUS, ordenarProjetos, progressoProjeto, STATUS_PROJETO,
  type CategoriaProjeto, type Feature, type Filtro, type Projeto, type StatusProjeto,
} from "@/lib/projetos";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { criarProjeto } from "@/lib/mutacoes";
import { diaMes } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cabecalho } from "@/components/app/cabecalho";

type FeatureResumo = Pick<Feature, "projeto_id" | "status" | "prioridade">;

export function TelaProjetos({ projetos, features, hoje }: { projetos: Projeto[]; features: FeatureResumo[]; hoje: string }) {
  const router = useRouter();
  const sb = criarClienteNavegador();
  const contagem = (f: Filtro) => projetos.filter((p) => (FILTROS[f].status as StatusProjeto[]).includes(p.status)).length;
  const [filtro, setFiltro] = useState<Filtro>(() => (contagem("ativos") ? "ativos" : "todos"));
  const [busca, setBusca] = useState("");
  const [ideia, setIdeia] = useState("");
  const [salvandoIdeia, setSalvandoIdeia] = useState(false);
  const [novo, setNovo] = useState(useSearchParams().get("novo") === "1");

  const termo = busca.trim().toLowerCase();
  const visiveis = ordenarProjetos(projetos.filter((p) =>
    (FILTROS[filtro].status as StatusProjeto[]).includes(p.status)
    && (!termo || [p.nome, p.resumo ?? "", ...p.tecnologias].some((t) => t.toLowerCase().includes(termo)))));

  async function anotarIdeia(e: React.FormEvent) {
    e.preventDefault();
    if (!ideia.trim()) return;
    setSalvandoIdeia(true);
    try {
      const id = await criarProjeto(sb, { nome: ideia.trim().slice(0, 80), status: "ideia" });
      setIdeia("");
      if (filtro !== "ideias" && filtro !== "todos") setFiltro("ideias");
      toast.success("Ideia anotada.", { action: { label: "Abrir", onClick: () => router.push(`/projetos/${id}`) } });
      router.refresh();
    } catch (erro) {
      toast.error((erro as Error).message);
    } finally {
      setSalvandoIdeia(false);
    }
  }

  return (
    <>
      <Cabecalho titulo="Projetos" acoes={<Button size="sm" onClick={() => setNovo(true)}><Plus className="size-4" /> Projeto</Button>}>
        Ideias de projetos para desenvolver: status, descrição, features e o próximo passo de cada um.
      </Cabecalho>

      <div className="space-y-4 px-4 pb-10 md:px-8">
        <form onSubmit={anotarIdeia} className="flex max-w-2xl items-center gap-2 rounded-xl border bg-card py-1.5 pr-1.5 pl-3 focus-within:ring-2 focus-within:ring-ring/40">
          <Lightbulb className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input value={ideia} onChange={(e) => setIdeia(e.target.value)} maxLength={80} aria-label="Ideia rápida"
            placeholder="Teve uma ideia? Anote o nome e detalhe depois…" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground" />
          <Button type="submit" size="sm" variant="secondary" disabled={!ideia.trim() || salvandoIdeia}>Anotar</Button>
        </form>

        {projetos.length === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed px-6 py-16 text-center">
            <FolderKanban className="size-8 text-muted-foreground" aria-hidden />
            <h2 className="mt-4 font-medium">Nenhum projeto ainda</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Anote ideias soltas no campo acima. Quando uma ganhar forma, abra o projeto para descrever, listar as features e acompanhar o andamento.</p>
            <Button className="mt-5" onClick={() => setNovo(true)}><Plus className="size-4" /> Criar projeto</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Filtrar projetos" className="flex flex-wrap gap-1">
                {(Object.keys(FILTROS) as Filtro[]).map((f) => (
                  <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}
                    className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      filtro === f && "bg-accent font-medium text-foreground")}>
                    {FILTROS[f].rotulo}<span className="numeros text-xs text-muted-foreground">{contagem(f)}</span>
                  </button>
                ))}
              </div>
              <label className="relative ml-auto w-full sm:w-56">
                <span className="sr-only">Buscar projeto</span>
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou tecnologia" className="h-8 pl-8 text-sm" />
              </label>
            </div>

            {visiveis.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                {termo ? "Nenhum projeto com esse nome ou tecnologia." : `Nada em ${FILTROS[filtro].rotulo.toLowerCase()}.`}
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visiveis.map((p) => <li key={p.id}><CartaoProjeto p={p} features={features.filter((f) => f.projeto_id === p.id)} hoje={hoje} /></li>)}
              </ul>
            )}
          </>
        )}
      </div>

      {novo && <DialogoNovoProjeto onFechar={() => setNovo(false)} onCriar={async (d) => {
        const id = await criarProjeto(sb, d);
        router.push(`/projetos/${id}`);
      }} />}
    </>
  );
}

function CartaoProjeto({ p, features, hoje }: { p: Projeto; features: FeatureResumo[]; hoje: string }) {
  const st = STATUS_PROJETO[p.status];
  const prog = progressoProjeto(features);
  const faltam = p.prazo ? diasEntre(hoje, p.prazo) : null;
  const ativo = p.status === "planejando" || p.status === "desenvolvendo";
  return (
    <Link href={`/projetos/${p.id}`} aria-label={p.nome}
      className={cn("group flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-input hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        p.status === "arquivado" && "opacity-70")}>
      <div className="flex items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium" style={{ color: st.cor }}>
          <span className="size-2 rounded-full" style={{ background: st.cor }} aria-hidden />{st.rotulo}
        </span>
        {p.categoria && <span className="text-muted-foreground">· {CATEGORIA_PROJETO[p.categoria]}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {p.prioridade === "alta" && <span className="rounded bg-aviso/15 px-1.5 py-0.5 font-medium text-aviso">Prioridade alta</span>}
          {p.fixado && <Pin className="size-3.5 text-muted-foreground" aria-label="Fixado" />}
        </span>
      </div>
      <h2 className="mt-2 font-semibold tracking-tight">{p.nome}</h2>
      {p.resumo ? <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{p.resumo}</p>
        : p.status === "ideia" && <p className="mt-0.5 text-sm text-muted-foreground/70">Sem descrição ainda</p>}

      {prog.total > 0 ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span className="numeros">{prog.feitas}/{prog.total} features</span>
            {prog.mvpTotal > 0 && <span className="numeros">MVP {prog.mvpFeitas}/{prog.mvpTotal}</span>}
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Features feitas" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.feitas}>
            <div className="h-full rounded-full bg-feito transition-[width]" style={{ width: `${(prog.pct ?? 0) * 100}%` }} />
          </div>
        </div>
      ) : p.status !== "ideia" && <p className="mt-3 text-xs text-muted-foreground">Nenhuma feature listada</p>}

      {ativo && p.proximo_passo && (
        <p className="mt-3 flex items-start gap-1.5 text-sm"><ArrowRight className="mt-0.5 size-3.5 shrink-0 text-feito" aria-hidden /><span className="line-clamp-2">{p.proximo_passo}</span></p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3 text-xs text-muted-foreground">
        {p.tecnologias.slice(0, 3).map((t) => <span key={t} className="rounded-md border px-1.5 py-0.5">{t}</span>)}
        {p.tecnologias.length > 3 && <span>+{p.tecnologias.length - 3}</span>}
        <span className="numeros ml-auto flex items-center gap-1">
          {p.prazo && p.status !== "concluido" && p.status !== "arquivado" ? (
            <span className={cn("flex items-center gap-1", faltam! < 0 ? "text-destructive" : faltam! <= 7 && "text-aviso")}>
              <CalendarClock className="size-3.5" aria-hidden />{faltam! < 0 ? `Atrasado (${diaMes(p.prazo)})` : `Prazo ${diaMes(p.prazo)}`}
            </span>
          ) : p.status === "ideia" ? `Anotada ${haQuanto(p.criado_em, hoje)}` : desdeStatus(p.status_desde, hoje)}
        </span>
      </div>
    </Link>
  );
}

function DialogoNovoProjeto({ onFechar, onCriar }: { onFechar: () => void; onCriar: (d: { nome: string; resumo: string | null; status: StatusProjeto; categoria: CategoriaProjeto | null }) => Promise<void> }) {
  const [nome, setNome] = useState("");
  const [resumo, setResumo] = useState("");
  const [status, setStatus] = useState<StatusProjeto>("ideia");
  const [categoria, setCategoria] = useState<CategoriaProjeto | "nenhuma">("nenhuma");
  const [ocupado, setOcupado] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>O básico agora. Descrição, features e links ficam na página do projeto.</DialogDescription>
        </DialogHeader>
        <form id="form-projeto" className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!nome.trim()) return;
          setOcupado(true);
          try {
            await onCriar({ nome: nome.trim(), resumo: resumo.trim() || null, status, categoria: categoria === "nenhuma" ? null : categoria });
            toast.success("Projeto criado.");
          } catch (erro) {
            toast.error((erro as Error).message);
            setOcupado(false);
          }
        }}>
          <div className="space-y-1.5"><Label htmlFor="p-nome" className="text-[13px]">Nome</Label><Input id="p-nome" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="Ex.: App de caronas da faculdade" /></div>
          <div className="space-y-1.5"><Label htmlFor="p-resumo" className="text-[13px]">Em uma frase</Label><Textarea id="p-resumo" rows={2} maxLength={160} value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="O que é e para quem" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-status" className="text-[13px]">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusProjeto)}>
                <SelectTrigger id="p-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{ORDEM_STATUS.map((s) => <SelectItem key={s} value={s}>{STATUS_PROJETO[s].rotulo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-cat" className="text-[13px]">Tipo</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaProjeto | "nenhuma")}>
                <SelectTrigger id="p-cat" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Sem tipo</SelectItem>
                  {(Object.keys(CATEGORIA_PROJETO) as CategoriaProjeto[]).map((c) => <SelectItem key={c} value={c}>{CATEGORIA_PROJETO[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>
        <DialogFooter><Button type="submit" form="form-projeto" disabled={ocupado || !nome.trim()}>Criar e abrir</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
