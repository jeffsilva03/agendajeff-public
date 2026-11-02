"use client";

import { Fragment } from "react";
import { AlertCircle, CalendarClock, CheckCheck, CircleCheck, CircleSlash, ExternalLink, History, MoreHorizontal, Paperclip, RotateCcw, Star } from "lucide-react";
import { ROTULO_SITUACAO_CLASSROOM, type ResolucaoLocal, type SituacaoEfetiva } from "@motor";
import { diasAtePrazo, mudouRecente, situacaoDe, textoPrazo, type AtividadeClassroom } from "@/lib/classroom/painel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Selo do estado: forma + texto, nunca só cor. Oficial (Classroom) e decisão pessoal têm estilos diferentes. */
export const ESTILO_SITUACAO: Record<SituacaoEfetiva, string> = {
  pendente: "bg-secondary text-foreground",
  atrasada: "bg-destructive/15 text-destructive",
  devolvida: "bg-tag-tarde/15 text-tag-tarde",
  entregue: "bg-feito/15 text-feito",
  nao_confirmada: "border border-dashed text-muted-foreground",
  concluida_local: "border border-feito/40 text-feito",
  dispensada: "border text-muted-foreground",
};
export const ICONE_SITUACAO: Partial<Record<SituacaoEfetiva, typeof CheckCheck>> = { entregue: CheckCheck, concluida_local: CircleCheck, dispensada: CircleSlash };

/** Ação pessoal sobre a atividade (só no AgendaJeff): resolver, reabrir ou dar a alteração como revisada. */
export type AcaoLocal = { tipo: "resolver"; resolucao: ResolucaoLocal } | { tipo: "reabrir" } | { tipo: "revisada" };

const PESSOAL = { a_fazer: null, fazendo: "Fazendo", pronto: "Pronto para enviar" } as const;

/** Itens do menu conforme o estado (os mesmos no cartão e no detalhe). */
export function acoesPossiveis(a: AtividadeClassroom, s: SituacaoEfetiva): { acao: AcaoLocal; rotulo: string; Icone: typeof CheckCheck }[] {
  const lista: { acao: AcaoLocal; rotulo: string; Icone: typeof CheckCheck }[] = [];
  if (s !== "entregue" && a.resolucao_local !== "concluida") lista.push({ acao: { tipo: "resolver", resolucao: "concluida" }, rotulo: "Concluir no AgendaJeff", Icone: CircleCheck });
  if (s !== "entregue" && a.resolucao_local !== "dispensada") lista.push({ acao: { tipo: "resolver", resolucao: "dispensada" }, rotulo: "Não preciso entregar", Icone: CircleSlash });
  if (a.resolucao_local && a.revisar_desde) lista.push({ acao: { tipo: "revisada" }, rotulo: "Já revisei a alteração", Icone: CheckCheck });
  if (a.resolucao_local) lista.push({ acao: { tipo: "reabrir" }, rotulo: "Reabrir atividade", Icone: RotateCcw });
  return lista;
}

export function SeloSituacao({ s }: { s: SituacaoEfetiva }) {
  const Icone = ICONE_SITUACAO[s];
  return <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium", ESTILO_SITUACAO[s])}>{Icone && <Icone className="size-3" aria-hidden />}{ROTULO_SITUACAO_CLASSROOM[s]}</span>;
}

export function CartaoAtividade({ a, disciplina, agora, onAbrir, onAcao }: { a: AtividadeClassroom; disciplina: string; agora: Date; onAbrir: () => void; onAcao: (a: AtividadeClassroom, acao: AcaoLocal) => void }) {
  const s = situacaoDe(a, agora);
  const dias = diasAtePrazo(a, agora);
  const urgente = (s === "pendente" || s === "nao_confirmada") && dias !== null && dias >= 0 && dias <= 3;
  const recente = mudouRecente(a, agora);
  const revisar = !!(a.resolucao_local && a.revisar_desde);
  const acoes = acoesPossiveis(a, s);
  const resolvida = s === "concluida_local" || s === "dispensada";
  return (
    <article data-atividade={a.activity_id} data-situacao={s} className={cn("flex h-full flex-col rounded-xl border bg-card transition-colors hover:border-input", urgente && "border-aviso/40", revisar && "border-aviso/50")}>
      <button type="button" onClick={onAbrir} className="flex flex-1 flex-col items-stretch justify-start p-3 text-left" aria-label={`${a.titulo}, ${ROTULO_SITUACAO_CLASSROOM[s]}`}>
        <span className="flex flex-wrap items-center gap-1.5 text-xs">
          <SeloSituacao s={s} />
          <span className="min-w-0 truncate text-muted-foreground">{disciplina}</span>
          {a.prioridade === 1 && <Star className="size-3.5 fill-aviso text-aviso" aria-label="Prioridade" />}
        </span>
        <span className={cn("mt-1.5 line-clamp-2 block text-sm font-medium", resolvida && "text-muted-foreground")}>{a.titulo}</span>
        <span className={cn("numeros mt-1 flex items-center gap-1 text-xs text-muted-foreground", s === "atrasada" && "text-destructive", urgente && "text-aviso")}>
          <CalendarClock className="size-3.5 shrink-0" aria-hidden />
          {textoPrazo(a)}
          {dias !== null && (s === "pendente" || s === "atrasada" || s === "nao_confirmada") && (dias === 0 ? ", hoje" : dias === 1 ? ", amanhã" : dias > 1 ? `, em ${dias} dias` : "")}
        </span>
        {revisar && <span className="mt-2 flex items-center gap-1 text-xs font-medium text-aviso"><AlertCircle className="size-3.5" aria-hidden />Mudou no Classroom depois da sua decisão: revise</span>}
        {(a.nota !== null || (recente && !revisar) || a.anexos.length > 0 || PESSOAL[a.status_pessoal]) && (
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {a.nota !== null && <span className="numeros font-medium text-foreground">Nota {Number(a.nota).toLocaleString("pt-BR")}{a.pontuacao_maxima ? `/${Number(a.pontuacao_maxima).toLocaleString("pt-BR")}` : ""}</span>}
            {recente && !revisar && <span className="flex items-center gap-1"><History className="size-3.5" aria-hidden />{a.mudancas.includes("prazo") ? "Prazo alterado" : "Alterada recentemente"}</span>}
            {a.anexos.length > 0 && <span className="flex items-center gap-1"><Paperclip className="size-3.5" aria-hidden />{a.anexos.length}</span>}
            {PESSOAL[a.status_pessoal] && !resolvida && <span>{PESSOAL[a.status_pessoal]}</span>}
          </span>
        )}
      </button>
      <div className="flex items-center border-t pr-1">
        {a.link ? (
          <a href={a.link} target="_blank" rel="noreferrer" className="flex flex-1 items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <ExternalLink className="size-3.5" aria-hidden /> Abrir no Classroom
          </a>
        ) : <span className="flex-1" />}
        {acoes.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label={`Ações de ${a.titulo}`}><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {acoes.map(({ acao, rotulo, Icone }, i) => (
                <Fragment key={rotulo}>
                  {acao.tipo === "reabrir" && i > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem onSelect={() => onAcao(a, acao)}><Icone /> {rotulo}</DropdownMenuItem>
                </Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </article>
  );
}
