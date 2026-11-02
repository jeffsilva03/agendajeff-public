"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Check, ChevronDown, Circle, CircleCheck, CircleDot, CalendarPlus, ExternalLink, GitBranch, Globe, MoreHorizontal, Pin, PinOff, Plus, Trash2,
} from "lucide-react";
import {
  CATEGORIA_PROJETO, desdeStatus, lerTecnologias, ORDEM_STATUS, ordenarFeatures, PRIORIDADE_FEATURE, PRIORIDADE_PROJETO, progressoProjeto,
  proximoStatusFeature, STATUS_FEATURE, STATUS_PROJETO,
  type CategoriaProjeto, type Feature, type PrioridadeFeature, type PrioridadeProjeto, type Projeto, type StatusFeature, type StatusProjeto,
} from "@/lib/projetos";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { atualizarFeature, atualizarProjeto, criarFeature, excluirFeature, excluirProjeto, salvarTarefa, type CamposProjeto } from "@/lib/mutacoes";
import { dataCurta } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Texto = "nome" | "resumo" | "descricao" | "problema" | "publico" | "proximo_passo" | "notas" | "repositorio_url" | "site_url" | "inicio" | "prazo";

export function DetalheProjeto({ projeto, features: iniciais, hoje }: { projeto: Projeto; features: Feature[]; hoje: string }) {
  const router = useRouter();
  const sb = criarClienteNavegador();
  const [p, setP] = useState(projeto);
  const salvo = useRef(projeto); // último estado gravado (lido só nos handlers)
  const [features, setFeatures] = useState(iniciais);
  const [estado, setEstado] = useState<"salvo" | "salvando" | null>(null);
  const [tecnologias, setTecnologias] = useState(projeto.tecnologias.join(", "));

  /** Grava só o que mudou desde a última gravação; em erro, volta o campo para o valor salvo. */
  async function salvar(campos: CamposProjeto) {
    const mudou = Object.fromEntries(Object.entries(campos).filter(([k, v]) => JSON.stringify(salvo.current[k as keyof Projeto]) !== JSON.stringify(v)));
    if (!Object.keys(mudou).length) return;
    setEstado("salvando");
    try {
      await atualizarProjeto(sb, p.id, mudou);
      salvo.current = { ...salvo.current, ...mudou } as Projeto;
      if ("status" in mudou) { salvo.current.status_desde = new Date().toISOString(); setP((x) => ({ ...x, status_desde: salvo.current.status_desde })); }
      setEstado("salvo");
      router.refresh();
    } catch (e) {
      setP((x) => ({ ...x, ...Object.fromEntries(Object.keys(mudou).map((k) => [k, salvo.current[k as keyof Projeto]])) }));
      setEstado(null);
      toast.error((e as Error).message);
    }
  }
  const mudar = <K extends keyof Projeto>(k: K, v: Projeto[K]) => { setP((x) => ({ ...x, [k]: v })); salvar({ [k]: v } as CamposProjeto); };

  const texto = (k: Texto, extra?: { obrigatorio?: boolean }) => ({
    value: (p[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP((x) => ({ ...x, [k]: e.target.value })),
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const v = e.target.value.trim();
      if (extra?.obrigatorio && !v) { setP((x) => ({ ...x, [k]: salvo.current[k] })); return; }
      // eslint-disable-next-line react-hooks/refs -- roda só no onBlur, não na renderização
      salvar({ [k]: v || null } as CamposProjeto);
    },
  });

  const prog = progressoProjeto(features);
  const st = STATUS_PROJETO[p.status];

  async function proHoje(titulo: string) {
    try {
      await salvarTarefa(sb, { titulo: `${p.nome}: ${titulo}`.slice(0, 200), data: hoje, hora: null, notas: null, prioridade: 0 });
      toast.success("Tarefa criada no Hoje.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="px-4 pt-4 pb-12 md:px-8 md:pt-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/projetos" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Projetos</Link>
        <span className="text-xs text-muted-foreground" aria-live="polite">{estado === "salvando" ? "Salvando…" : estado === "salvo" ? "Salvo" : ""}</span>
      </div>

      <header className="mt-4">
        <label htmlFor="pj-nome" className="sr-only">Nome do projeto</label>
        <input id="pj-nome" maxLength={80} {...texto("nome", { obrigatorio: true })}
          className="w-full rounded-md bg-transparent text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:text-[1.75rem]" />
        <label htmlFor="pj-resumo" className="sr-only">Em uma frase</label>
        <input id="pj-resumo" maxLength={160} placeholder="Em uma frase: o que é e para quem" {...texto("resumo")}
          className="mt-1 w-full rounded-md bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/40" />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Select value={p.status} onValueChange={(v) => mudar("status", v as StatusProjeto)}>
            <SelectTrigger aria-label="Status" className="h-8 w-auto gap-2 text-sm">
              <span className="size-2 rounded-full" style={{ background: st.cor }} aria-hidden /><SelectValue>{st.rotulo}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ORDEM_STATUS.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="flex flex-col"><span>{STATUS_PROJETO[s].rotulo}</span><span className="text-xs text-muted-foreground">{STATUS_PROJETO[s].dica}</span></span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={p.prioridade} onValueChange={(v) => mudar("prioridade", v as PrioridadeProjeto)}>
            <SelectTrigger aria-label="Prioridade" className="h-8 w-auto text-sm"><span className="text-muted-foreground">Prioridade</span><SelectValue /></SelectTrigger>
            <SelectContent>{(["alta", "media", "baixa"] as const).map((x) => <SelectItem key={x} value={x}>{PRIORIDADE_PROJETO[x]}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={p.categoria ?? "nenhuma"} onValueChange={(v) => mudar("categoria", v === "nenhuma" ? null : (v as CategoriaProjeto))}>
            <SelectTrigger aria-label="Tipo" className="h-8 w-auto text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhuma">Sem tipo</SelectItem>
              {(Object.keys(CATEGORIA_PROJETO) as CategoriaProjeto[]).map((c) => <SelectItem key={c} value={c}>{CATEGORIA_PROJETO[c]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" aria-pressed={p.fixado} onClick={() => mudar("fixado", !p.fixado)}>
            {p.fixado ? <><PinOff className="size-4" /> Desafixar</> : <><Pin className="size-4" /> Fixar no topo</>}
          </Button>
          <span className="numeros text-xs text-muted-foreground">{desdeStatus(p.status_desde, hoje)}</span>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Bloco titulo="Descrição">
            <Textarea aria-label="Descrição" rows={5} placeholder="Como funciona, telas principais, o que torna a ideia boa…" {...texto("descricao")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="pj-problema" className="text-[13px]">Problema que resolve</Label><Textarea id="pj-problema" rows={3} placeholder="Por que esse projeto deve existir?" {...texto("problema")} /></div>
              <div className="space-y-1.5"><Label htmlFor="pj-publico" className="text-[13px]">Para quem</Label><Textarea id="pj-publico" rows={3} placeholder="Quem vai usar" {...texto("publico")} /></div>
            </div>
          </Bloco>

          <Features projetoId={p.id} features={features} setFeatures={setFeatures} prog={prog} onProHoje={proHoje} onMudou={() => router.refresh()} />
        </div>

        <aside className="space-y-4">
          <Bloco titulo="Próximo passo">
            <Textarea aria-label="Próximo passo" rows={2} placeholder="A menor ação para o projeto andar" {...texto("proximo_passo")} />
            {p.proximo_passo && <Button variant="outline" size="sm" onClick={() => proHoje(p.proximo_passo!)}><CalendarPlus className="size-4" /> Colocar no Hoje</Button>}
          </Bloco>
          <Bloco titulo="Tecnologias">
            <Input aria-label="Tecnologias" placeholder="Separe por vírgula: Next.js, Supabase…" value={tecnologias} onChange={(e) => setTecnologias(e.target.value)}
              onBlur={() => { const l = lerTecnologias(tecnologias); setTecnologias(l.join(", ")); setP((x) => ({ ...x, tecnologias: l })); salvar({ tecnologias: l }); }} />
            {p.tecnologias.length > 0 && <div className="flex flex-wrap gap-1.5">{p.tecnologias.map((t) => <span key={t} className="rounded-md border px-1.5 py-0.5 text-xs">{t}</span>)}</div>}
          </Bloco>
          <Bloco titulo="Links">
            <CampoLink id="pj-repo" rotulo="Repositório" Icone={GitBranch} placeholder="https://github.com/…" valor={p.repositorio_url} props={texto("repositorio_url")} />
            <CampoLink id="pj-site" rotulo="Site ou demo" Icone={Globe} placeholder="https://…" valor={p.site_url} props={texto("site_url")} />
          </Bloco>
          <Bloco titulo="Datas">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="pj-inicio" className="text-[13px]">Início</Label><Input id="pj-inicio" type="date" {...texto("inicio")} /></div>
              <div className="space-y-1.5"><Label htmlFor="pj-prazo" className="text-[13px]">Prazo</Label><Input id="pj-prazo" type="date" {...texto("prazo")} /></div>
            </div>
          </Bloco>
          <Bloco titulo="Anotações">
            <Textarea aria-label="Anotações" rows={5} placeholder="Referências, concorrentes, dúvidas, ideias soltas…" {...texto("notas")} />
          </Bloco>
          <div className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
            <span>Criado em {dataCurta(p.criado_em.slice(0, 10))}</span>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={async () => {
              if (!confirm(`Excluir "${p.nome}" e todas as features? Se quiser só tirar da frente, use o status Arquivado.`)) return;
              try { await excluirProjeto(sb, p.id); toast.success("Projeto excluído."); router.push("/projetos"); router.refresh(); } catch (e) { toast.error((e as Error).message); }
            }}><Trash2 className="size-4" /> Excluir</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function CampoLink({ id, rotulo, Icone, placeholder, valor, props }: {
  id: string; rotulo: string; Icone: typeof Globe; placeholder: string; valor: string | null; props: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const valido = !!valor && /^https?:\/\//i.test(valor);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-[13px]"><Icone className="size-3.5 text-muted-foreground" /> {rotulo}</Label>
      <div className="flex gap-1.5">
        <Input id={id} type="url" placeholder={placeholder} {...props} />
        {valido && <Button variant="outline" size="icon" asChild><a href={valor!} target="_blank" rel="noreferrer" aria-label={`Abrir ${rotulo.toLowerCase()}`}><ExternalLink className="size-4" /></a></Button>}
      </div>
    </div>
  );
}

const ICONE_STATUS: Record<StatusFeature, typeof Circle> = { a_fazer: Circle, fazendo: CircleDot, feito: CircleCheck };

function Features({ projetoId, features, setFeatures, prog, onProHoje, onMudou }: {
  projetoId: string; features: Feature[]; setFeatures: React.Dispatch<React.SetStateAction<Feature[]>>;
  prog: ReturnType<typeof progressoProjeto>; onProHoje: (titulo: string) => void; onMudou: () => void;
}) {
  const sb = criarClienteNavegador();
  const [titulo, setTitulo] = useState("");
  const [prioridade, setPrioridade] = useState<PrioridadeFeature>("essencial");
  const [verFeitas, setVerFeitas] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const ordenadas = ordenarFeatures(features);
  const pendentes = ordenadas.filter((f) => f.status !== "feito");
  const feitas = ordenadas.filter((f) => f.status === "feito");

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    try {
      const nova = await criarFeature(sb, projetoId, { titulo, prioridade, ordem: features.reduce((m, f) => Math.max(m, f.ordem), -1) + 1 });
      setFeatures((l) => [...l, nova as Feature]);
      setTitulo("");
      onMudou();
    } catch (erro) {
      toast.error((erro as Error).message);
    }
  }

  async function alterar(f: Feature, d: Partial<Pick<Feature, "titulo" | "descricao" | "status" | "prioridade">>) {
    const antes = features;
    setFeatures((l) => l.map((x) => (x.id === f.id ? { ...x, ...d } : x)));
    try {
      await atualizarFeature(sb, f.id, d);
      onMudou();
    } catch (erro) {
      setFeatures(antes);
      toast.error((erro as Error).message);
    }
  }

  async function remover(f: Feature) {
    if (!confirm(`Excluir a feature "${f.titulo}"?`)) return;
    try {
      await excluirFeature(sb, f.id);
      setFeatures((l) => l.filter((x) => x.id !== f.id));
      onMudou();
    } catch (erro) {
      toast.error((erro as Error).message);
    }
  }

  const linha = (f: Feature) => (
    <LinhaFeature key={f.id} f={f} aberta={aberta === f.id} onAlternar={() => setAberta((a) => (a === f.id ? null : f.id))}
      onAlterar={(d) => alterar(f, d)} onRemover={() => remover(f)} onProHoje={() => onProHoje(f.titulo)} />
  );

  return (
    <section aria-label="Features" className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Features</h2>
        {prog.total > 0 && (
          <p className="numeros text-xs text-muted-foreground">
            {prog.feitas} de {prog.total} feitas{prog.mvpTotal > 0 && <> · MVP {prog.mvpFeitas}/{prog.mvpTotal}{prog.mvpPct === 1 && " pronto"}</>}
          </p>
        )}
      </div>
      {prog.total > 0 && (
        <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
          <div className="h-full rounded-full bg-feito" style={{ width: `${(prog.feitas / prog.total) * 100}%` }} />
          {prog.fazendo > 0 && <div className="h-full rounded-full bg-tag-tarde" style={{ width: `${(prog.fazendo / prog.total) * 100}%` }} />}
        </div>
      )}

      <form onSubmit={adicionar} className="mt-3 flex flex-wrap gap-2 sm:flex-nowrap">
        <Input aria-label="Nova feature" className="basis-full sm:basis-auto" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140} placeholder="Nova feature: ex. login com Google" />
        <Select value={prioridade} onValueChange={(v) => setPrioridade(v as PrioridadeFeature)}>
          <SelectTrigger aria-label="Prioridade da feature" className="flex-1 sm:w-32 sm:flex-none"><SelectValue>{PRIORIDADE_FEATURE[prioridade].rotulo}</SelectValue></SelectTrigger>
          <SelectContent>
            {(Object.keys(PRIORIDADE_FEATURE) as PrioridadeFeature[]).map((x) => (
              <SelectItem key={x} value={x}><span className="flex flex-col"><span>{PRIORIDADE_FEATURE[x].rotulo}</span><span className="text-xs text-muted-foreground">{PRIORIDADE_FEATURE[x].dica}</span></span></SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="icon" aria-label="Adicionar feature" disabled={!titulo.trim()}><Plus className="size-4" /></Button>
      </form>

      {features.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Liste o que o projeto precisa ter. Marque como <strong className="font-medium text-foreground">Essencial</strong> o que entra na primeira versão: o progresso do MVP sai daí.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y">{pendentes.map(linha)}</ul>
          {pendentes.length === 0 && <p className="mt-3 flex items-center gap-1.5 text-sm text-feito"><Check className="size-4" /> Todas as features feitas.</p>}
          {feitas.length > 0 && (
            <div className="mt-2">
              <button type="button" aria-expanded={verFeitas} onClick={() => setVerFeitas((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronDown className={cn("size-3.5 transition-transform", !verFeitas && "-rotate-90")} /> Feitas ({feitas.length})
              </button>
              {verFeitas && <ul className="mt-1 divide-y">{feitas.map(linha)}</ul>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function LinhaFeature({ f, aberta, onAlternar, onAlterar, onRemover, onProHoje }: {
  f: Feature; aberta: boolean; onAlternar: () => void; onAlterar: (d: Partial<Pick<Feature, "titulo" | "descricao" | "status" | "prioridade">>) => void; onRemover: () => void; onProHoje: () => void;
}) {
  const Icone = ICONE_STATUS[f.status];
  const [titulo, setTitulo] = useState(f.titulo);
  const [descricao, setDescricao] = useState(f.descricao ?? "");
  const proximo = proximoStatusFeature(f.status);
  return (
    <li data-feature={f.titulo} data-status={f.status} className="py-1.5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onAlterar({ status: proximo })} aria-label={`${f.titulo}: ${STATUS_FEATURE[f.status]}. Marcar como ${STATUS_FEATURE[proximo].toLowerCase()}`}
          className={cn("grid size-8 shrink-0 place-items-center rounded-md hover:bg-accent", f.status === "feito" ? "text-feito" : f.status === "fazendo" ? "text-tag-tarde" : "text-muted-foreground")}>
          <Icone className="size-[18px]" />
        </button>
        <button type="button" onClick={onAlternar} aria-expanded={aberta} className="min-w-0 flex-1 text-left">
          <span className={cn("block truncate text-sm", f.status === "feito" && "text-muted-foreground line-through")}>{f.titulo}</span>
          {!aberta && f.descricao && <span className="block truncate text-xs text-muted-foreground">{f.descricao}</span>}
        </button>
        {f.status === "fazendo" && <span className="hidden text-xs text-tag-tarde sm:inline">Fazendo</span>}
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px]", f.prioridade === "essencial" ? "bg-feito/15 text-feito" : f.prioridade === "importante" ? "bg-secondary text-foreground" : "text-muted-foreground")}>
          {PRIORIDADE_FEATURE[f.prioridade].rotulo}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Opções de ${f.titulo}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={f.status} onValueChange={(v) => onAlterar({ status: v as StatusFeature })}>
                  {(Object.keys(STATUS_FEATURE) as StatusFeature[]).map((s) => <DropdownMenuRadioItem key={s} value={s}>{STATUS_FEATURE[s]}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Prioridade</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={f.prioridade} onValueChange={(v) => onAlterar({ prioridade: v as PrioridadeFeature })}>
                  {(Object.keys(PRIORIDADE_FEATURE) as PrioridadeFeature[]).map((x) => <DropdownMenuRadioItem key={x} value={x}>{PRIORIDADE_FEATURE[x].rotulo}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={onAlternar}>Editar</DropdownMenuItem>
            {f.status !== "feito" && <DropdownMenuItem onSelect={onProHoje}><CalendarPlus /> Colocar no Hoje</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemover}><Trash2 /> Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {aberta && (
        <div className="mt-1.5 mb-2 ml-10 space-y-2">
          <Input aria-label="Título da feature" value={titulo} maxLength={140} onChange={(e) => setTitulo(e.target.value)}
            onBlur={() => { const t = titulo.trim(); if (!t) setTitulo(f.titulo); else if (t !== f.titulo) onAlterar({ titulo: t }); }} />
          <Textarea aria-label="Detalhes da feature" rows={3} value={descricao} placeholder="Detalhes, critérios de pronto, links…" onChange={(e) => setDescricao(e.target.value)}
            onBlur={() => { const d = descricao.trim() || null; if (d !== f.descricao) onAlterar({ descricao: d }); }} />
        </div>
      )}
    </li>
  );
}
