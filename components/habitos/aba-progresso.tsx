"use client";

import { useMemo, useState } from "react";
import { Flame, Trophy } from "lucide-react";
import { progressoHabitos, type historico, type Check, type ResumoHabito } from "@motor";
import type { ContextoCompleto } from "@/lib/dados";
import { COR_FLEXIVEL, corDaCadeia, diaMes } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { MapaCalor, Legenda } from "./mapa-calor";
import { DetalheHabito } from "./detalhe-habito";
import type { NotaHabito } from "./tela-habitos";

const META = 66; // Lally et al., 2010: mediana de 66 dias (faixa de 18 a 254)

export interface LinhaProgresso {
  id: string;
  nome: string;
  cor: string;
  onde: string;
  linha: ReturnType<typeof historico> extends Map<string, infer V> ? V : never;
  resumo: ResumoHabito;
  resumo7: ResumoHabito;
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function AbaProgresso({ ctx, checks, notas, hoje }: { ctx: ContextoCompleto; checks: Check[]; notas: NotaHabito[]; hoje: string }) {
  const inicio = ctx.inicioRastreamento ?? hoje;
  const [aberto, setAberto] = useState<string | null>(null);

  const progresso = useMemo(() => progressoHabitos(ctx, checks, hoje), [ctx, checks, hoje]);
  const linhas: LinhaProgresso[] = useMemo(() => progresso.habitos.map((h) => {
    const cadeia = ctx.cadeias.find((c) => c.passos.some((p) => p.habitoId === h.habitoId));
    return {
      id: h.habitoId, nome: h.nome,
      cor: cadeia ? corDaCadeia(cadeia) : h.flexivel ? COR_FLEXIVEL : "var(--muted-foreground)",
      onde: h.cadeias.length ? h.cadeias.join(", ") : h.flexivel ? "Flexível" : "Fora de cadeia",
      linha: h.linha, resumo: h.resumo, resumo7: h.resumo7,
    };
  }), [ctx.cadeias, progresso]);

  const dias = progresso.diasComRegistro;
  const soma7 = { f: progresso.adesao7.feitos, t: progresso.adesao7.total };
  const maiorSeq = linhas.find((l) => l.id === progresso.maiorSequencia?.habitoId);
  const maisPerto = linhas.find((l) => l.id === progresso.maisPertoDaMeta?.habitoId);
  const comecou = progresso.comecou;
  const detalhe = linhas.find((l) => l.id === aberto) ?? null;

  return (
    <div className="space-y-8">
      <section aria-label="Resumo" className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border bg-border">
        <Indicador rotulo="Dias com registro" curto="Dias" valor={String(dias)}
          nota={comecou ? `desde ${diaMes(inicio)}` : `o acompanhamento começa em ${diaMes(inicio)}`} />
        <Indicador rotulo="Adesão, últimos 7 dias" curto="7 dias" valor={soma7.t ? pct(soma7.f / soma7.t) : "—"}
          nota={soma7.t ? `${soma7.f} de ${soma7.t} hábitos-dia` : "aparece após o primeiro dia completo"} />
        <Indicador rotulo="Maior sequência atual" curto="Sequência" valor={maiorSeq?.resumo.sequenciaAtual ? `${maiorSeq.resumo.sequenciaAtual} d` : "—"}
          nota={maiorSeq?.resumo.sequenciaAtual ? maiorSeq.nome : "nenhuma sequência ainda"} icone={<Flame className="size-4 text-minimo" aria-hidden />} />
        <Indicador rotulo={`Mais perto dos ${META} dias`} curto={`Rumo ${META}`} valor={maisPerto?.resumo.diasPraticados ? `${maisPerto.resumo.diasPraticados}/${META}` : "—"}
          nota={maisPerto?.resumo.diasPraticados ? maisPerto.nome : "conta cada dia feito ou mínimo"} icone={<Trophy className="size-4 text-feito" aria-hidden />} />
      </section>

      <section aria-labelledby="t-habitos" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="t-habitos" className="text-base font-semibold">Cada hábito</h2>
            <p className="text-sm text-muted-foreground">Do início até o 66º dia. Toque num hábito para detalhes e edição.</p>
          </div>
          <div className="hidden sm:block"><Legenda /></div>
          {/* No celular a legenda abre ao toque, para os hábitos aparecerem logo */}
          <details className="w-full text-sm sm:hidden">
            <summary className="cursor-pointer text-xs text-muted-foreground underline underline-offset-4">Legenda das cores</summary>
            <div className="mt-2"><Legenda /></div>
          </details>
        </div>
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {linhas.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => setAberto(l.id)}
                className="group w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-input focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-medium">{l.nome}</h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="size-1.5 rounded-full" style={{ background: l.cor }} aria-hidden />{l.onde}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="numeros text-xl leading-none font-semibold">{pct(l.resumo.adesao)}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">adesão</p>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div className="overflow-hidden"><MapaCalor linha={l.linha} hoje={hoje} inicio={inicio} /></div>
                  <dl className="grid shrink-0 gap-2.5 text-right text-xs">
                    <div>
                      <dt className="text-muted-foreground">Sequência</dt>
                      <dd className="numeros flex items-center justify-end gap-1 text-base font-semibold">
                        <Flame className={cn("size-3.5", l.resumo.sequenciaAtual ? "text-minimo" : "text-muted-foreground/50")} aria-hidden />
                        {l.resumo.sequenciaAtual}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Melhor</dt>
                      <dd className="numeros text-base font-semibold">{l.resumo.melhorSequencia}</dd>
                    </div>
                  </dl>
                </div>
                <div className="mt-4 flex items-center gap-3 text-xs">
                  <span className="shrink-0 text-muted-foreground">Rumo aos {META} dias</span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
                    <span className="absolute inset-y-0 left-0 rounded-full bg-feito" style={{ width: `${Math.min(100, (l.resumo.diasPraticados / META) * 100)}%` }} />
                  </span>
                  <span className="numeros shrink-0 text-muted-foreground">{l.resumo.diasPraticados}/{META}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <DetalheHabito linha={detalhe} notas={notas.filter((n) => n.habitoId === aberto)} hoje={hoje} inicio={inicio} ctx={ctx} onFechar={() => setAberto(null)} />
    </div>
  );
}

/** No celular: rótulo curto e número, os quatro numa linha. No PC: rótulo completo e nota explicativa. */
function Indicador({ rotulo, curto, valor, nota, icone }: { rotulo: string; curto: string; valor: string; nota: string; icone?: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-card px-2.5 py-2.5 sm:p-4" title={`${rotulo}: ${nota}`}>
      <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground sm:text-xs">
        <span className="hidden sm:contents">{icone}</span>
        <span className="sm:hidden">{curto}</span><span className="hidden sm:inline">{rotulo}</span>
      </p>
      <p className="numeros mt-0.5 text-lg font-semibold tracking-tight sm:mt-2 sm:text-2xl">{valor}</p>
      <p className="mt-1 hidden truncate text-xs text-muted-foreground sm:block">{nota}</p>
    </div>
  );
}
