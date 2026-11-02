"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import type { TurmaClassroom } from "@/lib/classroom/painel";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Quais turmas acompanhar e a que disciplina do AgendaJeff cada uma corresponde. */
export function DialogoTurmas({ turmas, disciplinas, onFechar, onMudou }: {
  turmas: TurmaClassroom[]; disciplinas: { id: string; nome: string }[]; onFechar: () => void; onMudou: () => void;
}) {
  const sb = criarClienteNavegador();
  const [lista, setLista] = useState(turmas);
  const ativas = lista.filter((t) => t.estado === "ACTIVE");
  const fora = lista.filter((t) => t.estado !== "ACTIVE");

  async function salvar(t: TurmaClassroom, campos: Partial<Pick<TurmaClassroom, "acompanhar" | "nome_exibicao" | "disciplina_id">>) {
    setLista((l) => l.map((x) => (x.id === t.id ? { ...x, ...campos } : x)));
    const { error } = await sb.from("classroom_turmas").update(campos).eq("id", t.id);
    if (error) { setLista((l) => l.map((x) => (x.id === t.id ? t : x))); toast.error("Não foi possível salvar."); return; }
    onMudou();
  }

  const linha = (t: TurmaClassroom) => (
    <li key={t.id} className="space-y-2 py-3">
      <div className="flex items-start gap-3">
        <Switch checked={t.acompanhar} onCheckedChange={(v) => salvar(t, { acompanhar: v })} aria-label={`Acompanhar ${t.nome}`} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-words">{t.nome}</p>
          <p className="text-xs text-muted-foreground">
            {t.aliases.length > 0 && <>Também chamada de {t.aliases.join(", ")} · </>}
            {t.estado === "ACTIVE" ? "Ativa no Classroom" : t.estado ? t.estado : "Não aparece mais no Classroom"}
            {t.ultimo_erro && <span className="text-destructive"> · {t.ultimo_erro}</span>}
          </p>
        </div>
        {t.link && <a href={t.link} target="_blank" rel="noreferrer" aria-label={`Abrir ${t.nome} no Classroom`} className="text-muted-foreground hover:text-foreground"><ExternalLink className="size-4" /></a>}
      </div>
      {t.acompanhar && (
        <div className="ml-12 grid gap-2 sm:grid-cols-2">
          <Select value={t.disciplina_id ?? "nenhuma"} onValueChange={(v) => salvar(t, { disciplina_id: v === "nenhuma" ? null : v })}>
            <SelectTrigger aria-label={`Disciplina do AgendaJeff para ${t.nome}`} className="h-8 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhuma">Sem disciplina vinculada</SelectItem>
              {disciplinas.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input aria-label={`Nome de exibição para ${t.nome}`} className="h-8 text-sm" maxLength={80} defaultValue={t.nome_exibicao ?? ""} placeholder="Nome curto (opcional)"
            onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== t.nome_exibicao) salvar(t, { nome_exibicao: v }); }} />
        </div>
      )}
    </li>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Turmas do Classroom</DialogTitle>
          <DialogDescription>
            Marque só as turmas deste semestre: o Classroom mantém algumas turmas antigas como ativas. Uma turma com vários nomes
            (ex.: Automação, Projeto Integrador e Extensão) é uma turma só, e cada atividade aparece uma vez.
          </DialogDescription>
        </DialogHeader>
        {lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma turma ainda. Sincronize para buscar a lista no Classroom.</p> : (
          <>
            <ul className="divide-y">{ativas.map(linha)}</ul>
            {fora.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Fora da lista de ativas ({fora.length})</summary>
                <ul className="divide-y">{fora.map(linha)}</ul>
              </details>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
