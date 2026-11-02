"use client";

import { Check, CircleSlash, Ellipsis, Undo2, X, AlertTriangle, HalfCircle } from "./icones";
import { Flame, MessageSquareText, Timer } from "lucide-react";
import { useIsPresent } from "framer-motion";
import type { StatusCheck } from "@motor";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export interface ItemDoDia {
  habitoId: string;
  cadeiaId: string | null;
  nome: string;
  grupo: string; // nome da cadeia ou "Flexível"
  cor: string;
  periodo: string;
  quando: string | null;
  minimo: string | null;
  aviso: string | null; // só no primeiro passo da cadeia
  ordem: number;
}

interface Comum {
  item: ItemDoDia;
  status: StatusCheck | null;
  sequencia?: number;
  focoSemana?: boolean;
  nota?: string | null;
  onMarcar: (s: StatusCheck | null) => void;
  onAnotar?: () => void;
  onFoco?: () => void;
}

export const ROTULO_STATUS: Record<StatusCheck, string> = {
  completo: "Feito", minimo: "Mínimo", nao_feito: "Não feito", nao_se_aplica: "Não se aplica",
};

function Sequencia({ n, className }: { n: number; className?: string }) {
  if (n < 2) return null;
  return (
    <span className={cn("numeros inline-flex items-center gap-0.5 text-xs font-normal text-minimo", className)} title={`${n} dias seguidos`} aria-label={`${n} dias seguidos`}>
      <Flame className="size-3.5" aria-hidden />{n}
    </span>
  );
}

function SeloFoco() {
  return <span className="rounded bg-ring/20 px-1.5 text-[10px] leading-4 font-semibold text-ring">Foco da semana</span>;
}

function Nota({ texto }: { texto: string }) {
  return (
    <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground" title={texto}>
      <MessageSquareText className="mt-px size-3 shrink-0" aria-hidden /><span className="line-clamp-2">{texto}</span>
    </p>
  );
}

function MenuHabito({ item, status, nota, onMarcar, onAnotar, onFoco, className }: Comum & { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Mais opções para ${item.nome}`}
          className={cn("grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground", className)}>
          <Ellipsis className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => onMarcar("completo")}><Check className="text-feito" /> Feito</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMarcar("minimo")}><HalfCircle className="text-minimo" /> Mínimo</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMarcar("nao_feito")}><X /> Não feito</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMarcar("nao_se_aplica")}><CircleSlash /> Não se aplica hoje</DropdownMenuItem>
        {((onFoco && !status) || (status && onAnotar)) && <DropdownMenuSeparator />}
        {onFoco && !status && <DropdownMenuItem onSelect={onFoco}><Timer /> Iniciar foco</DropdownMenuItem>}
        {status && onAnotar && <DropdownMenuItem onSelect={onAnotar}><MessageSquareText /> {nota ? "Editar nota" : "Anotar"}</DropdownMenuItem>}
        {status && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onMarcar(null)}><Undo2 /> Voltar para pendente</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Ícone do status registrado (forma diferente para cada um, não só cor). */
function IconeStatus({ status }: { status: StatusCheck }) {
  if (status === "completo") return <span className="grid size-5 place-items-center rounded-full bg-feito text-background"><Check className="size-3.5" strokeWidth={3} /></span>;
  if (status === "minimo") return <HalfCircle className="size-5 text-minimo" />;
  if (status === "nao_feito") return <span className="grid size-5 place-items-center rounded-full border-2 border-pulado text-pulado"><X className="size-3" strokeWidth={3} /></span>;
  return <CircleSlash className="size-5 text-pulado" />;
}

/**
 * Linha compacta de hábito. Pendente: o círculo à esquerda marca feito e o meio círculo marca mínimo.
 * Registrado: o ícone mostra o status e tocar nele volta para pendente.
 */
export function LinhaHabito(props: Comum & { mostrarGrupo?: boolean; destacado?: boolean; somenteLeitura?: boolean }) {
  const { item, status, sequencia = 0, focoSemana, nota, onMarcar, mostrarGrupo, destacado, somenteLeitura } = props;
  const pendente = !status;
  return (
    <article data-item data-status={status ?? "pendente"} aria-label={`${item.nome}, ${item.grupo}. ${status ? ROTULO_STATUS[status] : "Pendente"}`}
      className={cn("flex items-center gap-1 rounded-lg py-1 pr-1 pl-1 transition-colors hover:bg-accent/50", destacado && "bg-ring/10 ring-1 ring-ring/50")}>
      {somenteLeitura ? (
        <span className="grid size-9 shrink-0 place-items-center" aria-hidden>
          <span className="size-5 rounded-full border-2 border-dashed border-input" />
        </span>
      ) : pendente ? (
        <button type="button" aria-label={`Marcar ${item.nome} como feito`} title="Feito" onClick={() => onMarcar("completo")}
          className="group/c grid size-9 shrink-0 place-items-center rounded-md">
          <span className="grid size-5 place-items-center rounded-full border-2 border-input text-transparent transition-colors group-hover/c:border-feito group-hover/c:text-feito">
            <Check className="size-3" strokeWidth={3} />
          </span>
        </button>
      ) : (
        <button type="button" aria-label={`Desfazer ${item.nome}`} title="Voltar para pendente" onClick={() => onMarcar(null)}
          className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-accent">
          <IconeStatus status={status} />
        </button>
      )}
      <div className="min-w-0 flex-1 py-0.5">
        <h3 className={cn("flex flex-wrap items-center gap-x-1.5 text-sm leading-snug font-medium",
          status === "nao_se_aplica" && "text-muted-foreground line-through decoration-muted-foreground/40",
          status === "nao_feito" && "text-muted-foreground")}>
          <span>{item.nome}</span>
          <Sequencia n={sequencia} />
          {focoSemana && <SeloFoco />}
        </h3>
        {mostrarGrupo ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: item.cor }} aria-hidden />
            <span className="truncate">{item.grupo}{status && status !== "completo" && ` · ${ROTULO_STATUS[status].toLowerCase()}`}</span>
          </p>
        ) : pendente && (item.quando || item.minimo) && (
          <p className="line-clamp-1 text-xs text-muted-foreground" title={item.minimo ? `Mínimo: ${item.minimo}` : undefined}>
            {item.minimo ? `mín. ${item.minimo}` : item.quando}
          </p>
        )}
        {nota && <Nota texto={nota} />}
      </div>
      {pendente && !somenteLeitura && (
        <button type="button" aria-label={`Marcar ${item.nome} como mínimo`} title="Mínimo" onClick={() => onMarcar("minimo")}
          className="grid size-9 shrink-0 place-items-center rounded-md text-minimo/80 hover:bg-minimo/15 hover:text-minimo">
          <HalfCircle className="size-4" />
        </button>
      )}
      {!somenteLeitura && <MenuHabito {...props} />}
    </article>
  );
}

/** O passo da vez: em destaque, com o gatilho, o mínimo e botões grandes. */
export function CartaoAgora(props: Comum & { destacado?: boolean; somenteLeitura?: boolean }) {
  const { item, sequencia = 0, focoSemana, nota, onMarcar, destacado, somenteLeitura } = props;
  // Saindo na animação de troca: some para leitores de tela e para os testes, e não recebe toques.
  const presente = useIsPresent();
  return (
    <article data-item={presente ? "" : undefined} data-status="pendente" aria-label={`${item.nome}, ${item.grupo}. Pendente`}
      aria-hidden={!presente || undefined} inert={!presente}
      className={cn("rounded-xl border border-l-[3px] border-input bg-card p-4 md:p-5", destacado && "ring-2 ring-ring/60")}
      style={{ borderLeftColor: item.cor }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg leading-snug font-semibold tracking-tight md:text-xl">
            <span>{item.nome}</span>
            <Sequencia n={sequencia} className="text-sm" />
            {focoSemana && <SeloFoco />}
          </h3>
          {item.quando && <p className="mt-1 text-sm text-muted-foreground">{item.quando}</p>}
          {item.minimo && <p className="mt-0.5 text-sm text-muted-foreground"><span className="text-minimo">Mínimo:</span> {item.minimo}</p>}
          {nota && <Nota texto={nota} />}
        </div>
        {!somenteLeitura && <MenuHabito {...props} className="-mt-1 -mr-1" />}
      </div>
      {item.aviso && (
        <p className="mt-3 flex items-center gap-1.5 rounded-md bg-aviso/10 px-2.5 py-1.5 text-xs text-aviso">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          <span>Colide com {item.aviso}</span>
        </p>
      )}
      {somenteLeitura ? (
        <p className="mt-4 text-xs text-muted-foreground">Dia futuro: dá para ver o que vem, e marcar só no próprio dia.</p>
      ) : (
      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
        <Button aria-label={`Marcar ${item.nome} como feito`} onClick={() => onMarcar("completo")}
          className="h-10 bg-feito text-background hover:bg-feito/90 sm:min-w-32">
          <Check className="size-4" strokeWidth={2.6} /> Feito
        </Button>
        <Button variant="outline" aria-label={`Marcar ${item.nome} como mínimo`} onClick={() => onMarcar("minimo")}
          className="h-10 border-minimo/40 text-minimo hover:bg-minimo/10 hover:text-minimo sm:min-w-32">
          <HalfCircle className="size-4" /> Mínimo
        </Button>
      </div>
      )}
    </article>
  );
}
