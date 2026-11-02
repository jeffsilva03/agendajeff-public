"use client";

import Link from "next/link";
import { AlertTriangle, CalendarCheck, ExternalLink, MoreHorizontal } from "lucide-react";
import { ROTULO_URGENCIA, situacaoDe, type AtividadeClassroom, type EntregaSemana, type Urgencia } from "@/lib/classroom/painel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { acoesPossiveis, type AcaoLocal } from "./cartao-atividade";

const DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const hh = (h: string) => (h.endsWith(":00") ? `${Number(h.slice(0, 2))}h` : `${Number(h.slice(0, 2))}h${h.slice(3, 5)}`);
const COR: Record<Urgencia, { faixa: string; texto: string; caixa: string }> = {
  atrasada: { faixa: "bg-destructive", texto: "text-destructive", caixa: "bg-destructive/15 text-destructive" },
  hoje: { faixa: "bg-destructive", texto: "text-destructive", caixa: "bg-destructive/15 text-destructive" },
  amanha: { faixa: "bg-aviso", texto: "text-aviso", caixa: "bg-aviso/15 text-aviso" },
  proxima: { faixa: "bg-border", texto: "text-muted-foreground", caixa: "bg-secondary text-foreground" },
};

/** "venceu há 3 dias", "vence hoje às 23h59", "amanhã às 19h", "em 4 dias, às 19h". */
function quando(e: EntregaSemana): string {
  const h = e.hora ? ` às ${hh(e.hora)}` : "";
  if (e.dias < 0) return e.naoConfirmada ? "Prazo passou; entrega não confirmada" : e.dias === -1 ? `Venceu ontem${h}` : `Venceu há ${-e.dias} dias`;
  if (e.dias === 0) return `Vence hoje${h}`;
  if (e.dias === 1) return `Amanhã${h}`;
  return `Em ${e.dias} dias${h}`;
}

/** Entregas atrasadas e dos próximos 7 dias, com destaque por urgência. */
export function EntregasSemana({ entregas, nome, agora, onAbrir, onAcao }: {
  entregas: EntregaSemana[]; nome: (e: EntregaSemana) => string; agora: Date;
  onAbrir: (a: AtividadeClassroom) => void; onAcao: (a: AtividadeClassroom, acao: AcaoLocal) => void;
}) {
  const grupos = (["atrasada", "hoje", "amanha", "proxima"] as Urgencia[]).map((u) => ({ u, itens: entregas.filter((e) => e.urgencia === u) })).filter((g) => g.itens.length);
  const criticas = entregas.filter((e) => e.urgencia === "atrasada" || e.urgencia === "hoje").length;
  return (
    <section aria-labelledby="t-semana" className={cn("rounded-xl border bg-card", criticas > 0 && "border-destructive/40")}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-3">
        <h2 id="t-semana" className="flex items-center gap-2 text-base font-semibold">
          {criticas > 0 ? <AlertTriangle className="size-4 text-destructive" aria-hidden /> : <CalendarCheck className="size-4 text-muted-foreground" aria-hidden />}
          Entregas da semana <span className="numeros font-normal text-muted-foreground">{entregas.length}</span>
        </h2>
        <p className="text-xs text-muted-foreground">
          {entregas.length === 0 ? "Nada para entregar nos próximos 7 dias." : criticas > 0 ? `${criticas} ${criticas === 1 ? "precisa" : "precisam"} de atenção agora. Atrasadas e as que vencem nos próximos 7 dias.` : "Atrasadas e as que vencem nos próximos 7 dias."}
        </p>
      </header>
      {entregas.length > 0 && (
        <div className="divide-y">
          {grupos.map(({ u, itens }) => (
            <div key={u} className="px-2 py-2">
              <h3 className={cn("px-2 pb-1 text-xs font-semibold tracking-wide", COR[u].texto)}>{ROTULO_URGENCIA[u]} <span className="numeros font-normal">{itens.length}</span></h3>
              <ul>
                {itens.map((e) => <Linha key={e.chave} e={e} nome={nome(e)} agora={agora} onAbrir={onAbrir} onAcao={onAcao} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Linha({ e, nome, agora, onAbrir, onAcao }: { e: EntregaSemana; nome: string; agora: Date; onAbrir: (a: AtividadeClassroom) => void; onAcao: (a: AtividadeClassroom, acao: AcaoLocal) => void }) {
  const cor = COR[e.urgencia];
  const w = DIA[new Date(`${e.data}T12:00:00Z`).getUTCDay()];
  const conteudo = (
    <>
      <span className={cn("grid w-11 shrink-0 place-items-center rounded-lg py-1 leading-none", cor.caixa)} aria-hidden>
        <span className="text-[10px] font-medium uppercase">{w}</span>
        <span className="numeros text-base font-semibold">{e.data.slice(8, 10)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium sm:line-clamp-1">{e.titulo}</span>
        {/* No celular o prazo fica embaixo do título (não espreme o nome); no PC, à direita. */}
        <span className={cn("numeros block text-xs font-medium sm:hidden", cor.texto)}>{quando(e)}</span>
        <span className="block truncate text-xs text-muted-foreground">{nome} · {e.origem === "classroom" ? "Classroom" : "Cadastrada na Faculdade"}{e.naoConfirmada && e.dias >= 0 ? " · entrega não confirmada" : ""}</span>
      </span>
      <span className={cn("numeros shrink-0 text-right text-xs font-medium max-sm:hidden", cor.texto)}>{quando(e)}</span>
    </>
  );
  const acoes = e.atividade ? acoesPossiveis(e.atividade, situacaoDe(e.atividade, agora)) : [];
  return (
    <li data-entrega={e.atividade?.activity_id ?? e.avaliacaoId} data-urgencia={e.urgencia} className="group relative flex items-center gap-1 rounded-lg hover:bg-accent/40">
      <span className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", cor.faixa)} aria-hidden />
      {e.atividade ? (
        <button type="button" onClick={() => onAbrir(e.atividade!)} className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left" aria-label={`Semana: ${e.titulo}, ${quando(e)}`}>{conteudo}</button>
      ) : (
        <Link href="/faculdade" className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2" aria-label={`Semana: ${e.titulo}, ${quando(e)}`}>{conteudo}</Link>
      )}
      {e.atividade?.link && (
        <Button variant="ghost" size="icon" className="size-8 shrink-0 max-sm:hidden" asChild>
          <a href={e.atividade.link} target="_blank" rel="noreferrer" aria-label={`Abrir ${e.titulo} no Classroom`}><ExternalLink className="size-4" /></a>
        </Button>
      )}
      {e.atividade && acoes.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Ações da semana para ${e.titulo}`}><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {acoes.map(({ acao, rotulo, Icone }) => <DropdownMenuItem key={rotulo} onSelect={() => onAcao(e.atividade!, acao)}><Icone /> {rotulo}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
