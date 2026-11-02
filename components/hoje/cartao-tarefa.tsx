"use client";

import { ArrowRight, Check, Ellipsis, Flag, Pencil, Repeat, Trash2, Clock, CircleStop } from "lucide-react";
import type { Tarefa } from "@/lib/dados";
import { diaMes, horaCurta } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Linha de tarefa avulsa: caixa de seleção à esquerda, detalhes e menu. */
export function LinhaTarefa({ tarefa, data, destacado, onConcluir, onEditar, onAdiar, onExcluir, onPararRepeticao }: {
  tarefa: Tarefa; data: string; destacado?: boolean;
  onConcluir: (feita: boolean) => void; onEditar: () => void; onAdiar: () => void; onExcluir: () => void; onPararRepeticao?: () => void;
}) {
  const feita = !!tarefa.concluidaEm;
  const atrasada = !feita && tarefa.data < data;
  const detalhes = !feita && (tarefa.hora || tarefa.notas || tarefa.recorrenteId || tarefa.prioridade === 1 || atrasada);
  return (
    <article data-tarefa data-status={feita ? "feita" : "pendente"} aria-label={`Tarefa: ${tarefa.titulo}. ${feita ? "Feita" : "Pendente"}`}
      className={cn("flex items-center gap-1 rounded-lg py-1 pr-1 pl-1 transition-colors hover:bg-accent/50", destacado && "bg-ring/10 ring-1 ring-ring/50")}>
      <button type="button" aria-label={feita ? `Reabrir ${tarefa.titulo}` : `Concluir ${tarefa.titulo}`} title={feita ? "Reabrir" : "Concluir"}
        onClick={() => onConcluir(!feita)} className="group/c grid size-9 shrink-0 place-items-center rounded-md">
        <span className={cn("grid size-[18px] place-items-center rounded-[5px] border-2 transition-colors",
          feita ? "border-feito bg-feito text-background" : "border-input text-transparent group-hover/c:border-feito group-hover/c:text-feito")}>
          <Check className="size-3" strokeWidth={3} />
        </span>
      </button>
      <div className="min-w-0 flex-1 py-0.5">
        <h3 className={cn("text-sm leading-snug font-medium", feita && "text-muted-foreground line-through decoration-muted-foreground/40")}>{tarefa.titulo}</h3>
        {detalhes && (
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {tarefa.hora && <span className="flex items-center gap-1"><Clock className="size-3 shrink-0" aria-hidden /><span className="numeros">{horaCurta(tarefa.hora)}</span></span>}
            {tarefa.prioridade === 1 && <span className="flex items-center gap-0.5 text-aviso"><Flag className="size-3" aria-hidden />importante</span>}
            {atrasada && <span className="numeros text-destructive">desde {diaMes(tarefa.data)}</span>}
            {tarefa.recorrenteId && <Repeat className="size-3" aria-label="Repete" />}
            {tarefa.notas && <span className="line-clamp-1 min-w-0">{tarefa.notas}</span>}
          </p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Mais opções para a tarefa ${tarefa.titulo}`} className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onEditar}><Pencil /> {tarefa.recorrenteId ? "Editar repetição" : "Editar"}</DropdownMenuItem>
          {!feita && !tarefa.recorrenteId && <DropdownMenuItem onSelect={onAdiar}><ArrowRight /> Passar para amanhã</DropdownMenuItem>}
          {tarefa.recorrenteId && onPararRepeticao && <DropdownMenuItem onSelect={onPararRepeticao}><CircleStop /> Parar de repetir</DropdownMenuItem>}
          {!tarefa.virtual && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onExcluir} className="text-destructive"><Trash2 /> Excluir</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}
