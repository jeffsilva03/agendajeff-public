"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarOff, GraduationCap, Undo2, UserX } from "lucide-react";
import type { DiaResolvido } from "@motor";
import type { ContextoCompleto } from "@/lib/dados";
import type { Falta } from "@/lib/faltas";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { voltarATerAula } from "@/lib/mutacoes";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DialogoFalta, DialogoSemAula } from "@/components/faculdade/dialogos-aula";

/**
 * Atalhos da aula no Hoje: "Não vai ter aula" (qualquer motivo) e "Faltei". Num dia que virou sem aula
 * por uma marcação (não por feriado), dá para desfazer.
 */
export function AcoesAula({ dia, ctx, hoje, futuro, faltas }: { dia: DiaResolvido; ctx: ContextoCompleto; hoje: string; futuro: boolean; faltas: Falta[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<"sem_aula" | "falta" | null>(null);
  const aulas = ctx.aulas ?? [];
  const marcadoSemAula = ctx.eventos.some((e) => e.tipo === "excecao_rotina" && e.data === dia.data && e.efeito?.sem_aula);
  const disciplinas = [...new Map(aulas.map((a) => [a.disciplinaId, { id: a.disciplinaId, nome: a.disciplina }])).values()];
  if (!dia.diaDeAula && !dia.aulas.length && !faltas.length) return null;

  return (
    <>
      {faltas.length > 0 && (
        <span className="flex items-center gap-1 rounded-md bg-aviso/15 px-2 py-0.5 text-xs font-medium text-aviso">
          <UserX className="size-3.5" aria-hidden /> {faltas.length === 1 ? "Falta registrada" : `${faltas.length} faltas registradas`}
        </span>
      )}
      {dia.temAula || dia.aulas.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs"><GraduationCap className="size-3.5" /> Aula</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setAberto("sem_aula")}><CalendarOff /> Não vai ter aula…</DropdownMenuItem>
            {!futuro && <DropdownMenuItem onSelect={() => setAberto("falta")}><UserX /> Faltei…</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : marcadoSemAula && (
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={async () => {
          try {
            await voltarATerAula(criarClienteNavegador(), dia.data);
            toast.success(faltas.length ? "O dia voltou a ter aula. As faltas continuam registradas." : "O dia voltou a ter aula.");
            router.refresh();
          } catch (e) { toast.error((e as Error).message); }
        }}><Undo2 className="size-3.5" /> Voltar a ter aula</Button>
      )}
      {aberto === "sem_aula" && <DialogoSemAula dataInicial={dia.data} aulas={aulas} onFechar={() => setAberto(null)} onFeito={() => router.refresh()} />}
      {aberto === "falta" && <DialogoFalta dataInicial={dia.data} hoje={hoje} aulas={aulas} disciplinas={disciplinas} onFechar={() => setAberto(null)} onFeito={() => router.refresh()} />}
    </>
  );
}
