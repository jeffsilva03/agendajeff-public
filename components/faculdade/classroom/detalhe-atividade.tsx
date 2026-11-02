"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, ExternalLink, Loader2, Paperclip } from "lucide-react";
import { ROTULO_ENTREGA_CLASSROOM, prazoLocal } from "@motor";
import { situacaoDe, textoPrazo, type AtividadeClassroom } from "@/lib/classroom/painel";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { salvarTarefa } from "@/lib/mutacoes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { acoesPossiveis, SeloSituacao, type AcaoLocal } from "./cartao-atividade";

const quando = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : null);
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

type Pessoal = Pick<AtividadeClassroom, "status_pessoal" | "prioridade" | "notas_pessoais" | "inicio_planejado" | "avaliacao_id">;

export function DetalheAtividade({ a, disciplina, agora, hoje, avaliacoes, onFechar, onMudou, onAcao }: {
  a: AtividadeClassroom; disciplina: string; agora: Date; hoje: string;
  avaliacoes: { id: string; tipo: string; titulo: string; data: string; entregue: boolean }[]; onFechar: () => void; onMudou: () => void;
  onAcao: (a: AtividadeClassroom, acao: AcaoLocal) => void;
}) {
  const sb = criarClienteNavegador();
  const s = situacaoDe(a, agora);
  const [completo, setCompleto] = useState<{ descricao: string | null; anexos: { tipo: string; nome: string | null; link: string | null }[] } | "carregando" | "erro">(a.descricao_truncada ? "carregando" : { descricao: a.descricao, anexos: a.anexos });
  const [p, setP] = useState<Pessoal>({ status_pessoal: a.status_pessoal, prioridade: a.prioridade, notas_pessoais: a.notas_pessoais, inicio_planejado: a.inicio_planejado, avaliacao_id: a.avaliacao_id });

  // Descrição completa só quando a da lista veio cortada (uma chamada, ao abrir).
  useEffect(() => {
    if (!a.descricao_truncada) return;
    let vivo = true;
    fetch(`/api/classroom/atividade?id=${a.id}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (vivo) setCompleto(r.ok ? j : "erro");
    }).catch(() => vivo && setCompleto("erro"));
    return () => { vivo = false; };
  }, [a.id, a.descricao_truncada]);

  async function salvar(campos: Partial<Pessoal>) {
    const antes = p;
    setP((x) => ({ ...x, ...campos }));
    const { error } = await sb.from("classroom_atividades").update(campos).eq("id", a.id);
    if (error) { setP(antes); toast.error("Não foi possível salvar."); return; }
    onMudou();
  }

  const prazoAntigo = a.prazo_anterior && a.mudancas.includes("prazo") ? textoPrazo({ prazo_precisao: a.prazo_anterior.precisao, prazo_em: a.prazo_anterior.em, prazo_data: a.prazo_anterior.data }) : null;
  const local = prazoLocal({ precisao: a.prazo_precisao, em: a.prazo_em, data: a.prazo_data });
  const desc = completo === "carregando" || completo === "erro" ? a.descricao : completo.descricao;
  const anexos = completo === "carregando" || completo === "erro" ? a.anexos : completo.anexos;

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">{a.titulo}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span className="text-xs"><SeloSituacao s={s} /></span>
            <span>{disciplina} · Google Classroom</span>
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-x-6 gap-y-3 rounded-lg border p-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Prazo oficial</dt><dd className="numeros">{textoPrazo(a)}{prazoAntigo && <span className="block text-xs text-aviso">Antes: {prazoAntigo}</span>}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Sua entrega no Classroom</dt><dd>{a.entrega_estado ? ROTULO_ENTREGA_CLASSROOM[a.entrega_estado] : "Não informada pelo Classroom"}{a.entrega_atrasada === true && <span className="text-destructive"> · atrasada segundo o Google</span>}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Nota</dt><dd className="numeros">{a.nota !== null ? `${Number(a.nota).toLocaleString("pt-BR")}${a.pontuacao_maxima ? ` de ${Number(a.pontuacao_maxima).toLocaleString("pt-BR")}` : ""}` : `Sem nota lançada${a.pontuacao_maxima ? ` (vale ${Number(a.pontuacao_maxima).toLocaleString("pt-BR")})` : ""}`}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Atualizada no Classroom</dt><dd className="numeros">{quando(a.atualizado_origem) ?? "—"}{a.entrega_atualizada_origem && <span className="block text-xs text-muted-foreground">Entrega: {quando(a.entrega_atualizada_origem)}</span>}</dd></div>
        </dl>

        <section aria-label="Sua decisão" className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm", a.resolucao_local && a.revisar_desde && "border-aviso/50")}>
          <p className="min-w-0 flex-1">
            {a.resolucao_local === "concluida" ? <>Você concluiu no AgendaJeff{a.resolvida_em && ` em ${quando(a.resolvida_em)}`}.</>
              : a.resolucao_local === "dispensada" ? <>Você dispensou esta atividade{a.resolvida_em && ` em ${quando(a.resolvida_em)}`}.</>
              : s === "entregue" ? "Entregue no Classroom: não precisa de nenhuma ação aqui."
              : "Já fez ou não precisa entregar? Resolva só no AgendaJeff."}
            <span className="block text-xs text-muted-foreground">
              {a.resolucao_local && a.revisar_desde ? <span className="font-medium text-aviso">O Classroom mudou depois da sua decisão ({a.mudancas.join(", ")}). Ela foi mantida; revise.</span>
                : "Nada é enviado ao Classroom: lá a atividade continua como está."}
            </span>
          </p>
          {acoesPossiveis(a, s).map(({ acao, rotulo, Icone }) => (
            <Button key={rotulo} variant="outline" size="sm" onClick={() => onAcao(a, acao)}><Icone className="size-4" /> {rotulo}</Button>
          ))}
        </section>

        <section aria-label="Descrição" className="space-y-1.5">
          <h3 className="text-sm font-semibold">Descrição</h3>
          {completo === "carregando" && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Carregando a descrição completa…</p>}
          {completo === "erro" && <p className="text-xs text-aviso">Não deu para buscar a descrição completa agora; abaixo, o trecho sincronizado.</p>}
          {desc ? <p className="max-h-64 overflow-y-auto whitespace-pre-line rounded-lg bg-secondary/40 p-3 text-sm">{desc}</p> : <p className="text-sm text-muted-foreground">Sem descrição no Classroom.</p>}
        </section>

        {anexos.length > 0 && (
          <section aria-label="Anexos" className="space-y-1.5">
            <h3 className="text-sm font-semibold">Anexos</h3>
            <ul className="space-y-1">
              {anexos.map((x, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {x.link ? <a href={x.link} target="_blank" rel="noreferrer" className="truncate underline-offset-4 hover:underline">{x.nome ?? x.link}</a> : <span className="truncate">{x.nome ?? x.tipo}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Seu planejamento" className="space-y-3 rounded-lg border p-3">
          <h3 className="text-sm font-semibold">Seu planejamento <span className="font-normal text-muted-foreground">(só no AgendaJeff; a sincronização não mexe)</span></h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cl-pessoal" className="text-[13px]">Andamento</Label>
              <Select value={p.status_pessoal} onValueChange={(v) => salvar({ status_pessoal: v as Pessoal["status_pessoal"] })}>
                <SelectTrigger id="cl-pessoal" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="a_fazer">A fazer</SelectItem><SelectItem value="fazendo">Fazendo</SelectItem><SelectItem value="pronto">Pronto para enviar</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="cl-inicio" className="text-[13px]">Começar em</Label><Input id="cl-inicio" type="date" value={p.inicio_planejado ?? ""} onChange={(e) => salvar({ inicio_planejado: e.target.value || null })} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-prio" className="text-[13px]">Prioridade</Label>
              <Select value={String(p.prioridade)} onValueChange={(v) => salvar({ prioridade: Number(v) })}>
                <SelectTrigger id="cl-prio" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="0">Normal</SelectItem><SelectItem value="1">Importante</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-notas" className="text-[13px]">Anotações</Label>
            <Textarea id="cl-notas" rows={2} defaultValue={p.notas_pessoais ?? ""} placeholder="Ideias, dúvidas, o que falta…" onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== p.notas_pessoais) salvar({ notas_pessoais: v }); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-aval" className="text-[13px]">Vincular a uma avaliação cadastrada</Label>
            <Select value={p.avaliacao_id ?? "nenhuma"} onValueChange={(v) => salvar({ avaliacao_id: v === "nenhuma" ? null : v })}>
              <SelectTrigger id="cl-aval" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Sem vínculo</SelectItem>
                {avaliacoes.map((v) => <SelectItem key={v.id} value={v.id}>{v.titulo} · {dm(v.data)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Com vínculo, a agenda mostra uma entrada só (o prazo e o estado do Classroom). A avaliação continua na Faculdade com os seus dados.</p>
          </div>
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              const data = p.inicio_planejado && p.inicio_planejado >= hoje ? p.inicio_planejado : hoje;
              await salvarTarefa(sb, { titulo: `${a.titulo}${local ? ` (entrega ${dm(local.data)})` : ""}`.slice(0, 200), data, hora: null, notas: a.link, prioridade: p.prioridade });
              toast.success(`Tarefa criada para ${data === hoje ? "hoje" : dm(data)}.`);
            } catch (e) { toast.error((e as Error).message); }
          }}><CalendarPlus className="size-4" /> Criar tarefa para trabalhar nisso</Button>
        </section>

        {a.link && <Button asChild variant="outline" className="w-full"><a href={a.link} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Abrir no Classroom</a></Button>}
      </DialogContent>
    </Dialog>
  );
}
