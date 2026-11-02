"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { inicioDoMes, somarMeses, type Check, type Meta } from "@motor";
import type { ContextoCompleto } from "@/lib/dados";
import { cn } from "@/lib/utils";
import { Cabecalho } from "@/components/app/cabecalho";
import { AbaMetas } from "./metas";
import { AbaRaiox } from "./raiox";
import { AbaRevisao } from "./revisao";

export type Aba = "metas" | "raiox" | "revisao";

export interface NotaLinha {
  mes: string; area_id: string; importancia: number | null; acao: number | null; valor: string | null; compromisso: string | null;
  foco: boolean; meta_acao: number | null; como_medir: string | null;
}
export interface Area { id: string; nome: string; ordem: number }

export interface DadosMes {
  hoje: string;
  mes: string; // primeiro dia
  aba: Aba;
  ctx: ContextoCompleto;
  checks: Check[];
  areas: Area[];
  notas: NotaLinha[]; // do mês e do anterior
  raioxMes: { o_que_sai: string | null; checkin: string | null } | null;
  metas: Meta[];
  revisao: { nota: number | null; funcionou: string | null; nao_funcionou: string | null; aprendi: string | null; foco_proximo: string | null } | null;
  numeros: {
    tarefas: { total: number; feitas: number };
    horasFreela: number;
    candidaturas: number;
    minutosFoco: number;
    avaliacoes: { id: string; tipo: string; titulo: string; data: string; entregue: boolean; nota: number | null; disciplina: string | null }[];
  };
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;

const ABAS: { id: Aba; rotulo: string; descricao: string }[] = [
  { id: "metas", rotulo: "Metas", descricao: "O que você quer alcançar no mês, com o progresso de cada meta." },
  { id: "raiox", rotulo: "Raio-X da vida", descricao: "Importância e ação em cada área da vida, com um plano de ação para o mês." },
  { id: "revisao", rotulo: "Revisão", descricao: "Os números do mês e uma reflexão rápida para começar o próximo." },
];

export function TelaMes(d: DadosMes) {
  const parametros = useSearchParams();
  const url = (mudar: { mes?: string; aba?: Aba }) => {
    const q = new URLSearchParams(parametros.toString());
    const mes = mudar.mes ?? d.mes;
    if (mes === inicioDoMes(d.hoje)) q.delete("mes"); else q.set("mes", mes.slice(0, 7));
    const aba = mudar.aba ?? d.aba;
    if (aba === "metas") q.delete("aba"); else q.set("aba", aba);
    const s = q.toString();
    return s ? `/mes?${s}` : "/mes";
  };
  const atual = d.mes === inicioDoMes(d.hoje);
  const titulo = nomeDoMes(d.mes);

  return (
    <>
      <Cabecalho
        titulo={<span className="flex items-center gap-1">
          <Link href={url({ mes: somarMeses(d.mes, -1) })} aria-label="Mês anterior" scroll={false} className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronLeft className="size-5" /></Link>
          <span className="first-letter:uppercase">{titulo}</span>
          <Link href={url({ mes: somarMeses(d.mes, 1) })} aria-label="Próximo mês" scroll={false} className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronRight className="size-5" /></Link>
          {!atual && <Link href={url({ mes: inicioDoMes(d.hoje) })} className="ml-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent">Mês atual</Link>}
        </span>}>
        {ABAS.find((a) => a.id === d.aba)!.descricao}
      </Cabecalho>
      <nav aria-label="Seções do mês" className="flex gap-1 overflow-x-auto px-4 pb-4 md:px-8">
        {ABAS.map((a) => (
          <Link key={a.id} href={url({ aba: a.id })} aria-current={a.id === d.aba ? "page" : undefined} scroll={false}
            className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
              a.id === d.aba && "bg-accent font-medium text-foreground")}>
            {a.rotulo}
          </Link>
        ))}
      </nav>
      <div className="max-w-6xl px-4 pb-16 md:px-8">
        {/* A chave muda quando as metas mudam no servidor (após criar, editar ou excluir), recarregando a lista. */}
        {d.aba === "metas" && <AbaMetas key={d.metas.map((m) => `${m.id}:${m.progresso}:${m.concluidaEm ?? ""}:${m.titulo}`).join("|")} {...d} />}
        {d.aba === "raiox" && <AbaRaiox {...d} />}
        {d.aba === "revisao" && <AbaRevisao {...d} />}
      </div>
    </>
  );
}
