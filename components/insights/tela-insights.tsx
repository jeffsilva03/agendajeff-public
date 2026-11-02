"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Lock, Lightbulb } from "lucide-react";
import {
  adesaoPorDiaSemana, adesaoPorHabito, adesaoPorPeriodo, coocorrencia, diaDaSemana, diasComRegistro, estadoLimiar,
  focoPorSemana, quebraDeCadeia, revisaoSemanal, somarDias, type Analise, type Check, type SessaoFoco,
} from "@motor";
import type { ContextoCompleto } from "@/lib/dados";
import { corDaCadeia, diaMes } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { Cabecalho } from "@/components/app/cabecalho";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const COR_DADO = "var(--tag-tarde)";
const PERIODO: Record<string, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite", livre: "Sem horário" };
const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function TelaInsights({ ctx, checks, hoje, horaAgora, focos }: { ctx: ContextoCompleto; checks: Check[]; hoje: string; horaAgora: string | null; focos: SessaoFoco[] }) {
  const inicio = ctx.inicioRastreamento ?? hoje;
  const de = inicio < hoje ? inicio : hoje;
  const dias = diasComRegistro(checks);
  const nome = useMemo(() => new Map(ctx.habitos.map((h) => [h.id, h.nome])), [ctx.habitos]);
  const minimos = useMemo(() => new Map(ctx.cadeias.flatMap((c) => c.passos.map((p) => [p.habitoId, p.minimo] as [string, string | null]))), [ctx.cadeias]);

  const dados = useMemo(() => ({
    habitos: adesaoPorHabito(ctx, checks, de, hoje).filter((h) => h.diasQueValeram > 0).sort((a, b) => (b.adesao ?? 0) - (a.adesao ?? 0)),
    quebras: quebraDeCadeia(ctx, checks, de, hoje),
    periodos: adesaoPorPeriodo(ctx, checks, de, hoje).filter((p) => p.total > 0),
    semana: adesaoPorDiaSemana(ctx, checks, de, hoje),
    pares: coocorrencia(ctx, checks, de, hoje),
    revisao: revisaoSemanal(ctx, checks, hoje, minimos),
  }), [ctx, checks, de, hoje, minimos]);

  const domingo = diaDaSemana(hoje) === 0;
  const proximoDomingo = somarDias(hoje, (7 - diaDaSemana(hoje)) % 7 || 7);
  const revisaoNova = domingo && (!horaAgora || horaAgora >= "18:00");
  const r = dados.revisao;

  return (
    <>
      <Cabecalho titulo="Insights">
        {dias} {dias === 1 ? "dia" : "dias"} com registro. Cada análise aparece quando houver dias suficientes; nada é estimado.
      </Cabecalho>
      <div className="space-y-6 px-4 pb-16 md:px-8">

        <section id="revisao" aria-labelledby="t-revisao" className="scroll-mt-4 rounded-xl border bg-card">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
            <div>
              <h2 id="t-revisao" className="flex items-center gap-2 text-[15px] font-semibold">
                {domingo ? "Revisão da semana" : "Últimos 7 dias"}
                {revisaoNova && <span className="rounded bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">Nova</span>}
              </h2>
              <p className="numeros text-xs text-muted-foreground">
                {diaMes(r.de)} a {diaMes(r.ate)}{!domingo && `. A revisão fecha no domingo, ${diaMes(proximoDomingo)}, à noite.`}
              </p>
            </div>
            <p className="numeros text-right">
              <span className="text-2xl font-semibold">{pct(r.adesao)}</span>
              <span className="ml-2 text-xs text-muted-foreground">{r.total ? `${r.feitos} de ${r.total} hábitos-dia` : "sem registros"}</span>
            </p>
          </header>
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1.2fr]">
            <div className={cn("flex gap-3 rounded-lg border p-4", r.sugestao.tipo === "sem_dados" ? "bg-secondary/40" : "border-minimo/30 bg-minimo/[0.06]")}>
              <Lightbulb className={cn("mt-0.5 size-4 shrink-0", r.sugestao.tipo === "sem_dados" ? "text-muted-foreground" : "text-minimo")} aria-hidden />
              <div className="text-sm">
                <p className="font-medium">{r.sugestao.tipo === "sem_dados" ? "Sem sugestão por enquanto" : "Sugestão para a próxima semana"}</p>
                <p className="mt-1 text-muted-foreground">{r.sugestao.texto}</p>
                {(r.sugestao.tipo === "reduzir_minimo" || r.sugestao.tipo === "definir_minimo") && (
                  <Link href="/habitos" className="mt-2 inline-block text-sm underline underline-offset-4">Ajustar em Hábitos</Link>
                )}
              </div>
            </div>
            {r.porHabito.length > 0 ? (
              <Barras itens={[...r.porHabito].sort((a, b) => (b.adesao ?? 0) - (a.adesao ?? 0)).map((h) => ({ chave: h.habitoId, rotulo: nome.get(h.habitoId) ?? "", valor: h.adesao, detalhe: `${h.feitos}/${h.total}` }))} />
            ) : <p className="self-center text-sm text-muted-foreground">Os hábitos da semana aparecem aqui quando você registrar.</p>}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao titulo="Adesão por hábito" descricao="Feito ou mínimo, nos dias em que o hábito valia." analise="adesao" dias={dias}>
            <Barras itens={dados.habitos.map((h) => ({ chave: h.habitoId, rotulo: nome.get(h.habitoId) ?? "", valor: h.adesao, detalhe: `${h.completos + h.minimos}/${h.diasQueValeram}` }))} />
          </Cartao>

          <Cartao titulo="Onde a cadeia quebra" descricao="Em quantos dias cada cadeia parou em cada passo." analise="quebra" dias={dias}>
            <div className="space-y-5">
              {dados.quebras.map((q) => {
                const c = ctx.cadeias.find((x) => x.id === q.cadeiaId)!;
                const maior = Math.max(1, ...q.paradas.map((p) => p.vezes));
                const gargalo = q.paradas.reduce((a, b) => (b.vezes > a.vezes ? b : a), q.paradas[0]);
                return (
                  <div key={q.cadeiaId}>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="size-2 rounded-full" style={{ background: corDaCadeia(c) }} aria-hidden />{c.nome}
                      <span className="numeros ml-auto text-xs font-normal text-muted-foreground">completa em {q.completas} de {q.dias} dias</span>
                    </p>
                    <ol className="mt-2 space-y-1">
                      {q.paradas.map((p, i) => (
                        <li key={p.habitoId} className="grid grid-cols-[1rem_minmax(0,9rem)_1fr_2rem] items-center gap-2 text-xs" title={`Parou em ${nome.get(p.habitoId)} em ${p.vezes} dias`}>
                          <span className="numeros text-muted-foreground">{i + 1}</span>
                          <span className="truncate">{nome.get(p.habitoId)}</span>
                          <span className="h-2 overflow-hidden rounded-full bg-secondary">
                            <span className="block h-full rounded-full" style={{ width: `${(p.vezes / maior) * 100}%`, background: COR_DADO }} />
                          </span>
                          <span className="numeros text-right text-muted-foreground">{p.vezes}</span>
                        </li>
                      ))}
                    </ol>
                    {gargalo?.vezes > 0 && <p className="mt-1.5 text-xs text-muted-foreground">Mais parou em <span className="text-foreground">{nome.get(gargalo.habitoId)}</span>. Vale revisar o gatilho dele.</p>}
                  </div>
                );
              })}
            </div>
          </Cartao>

          <Cartao titulo="Adesão por período do dia" descricao="Manhã, tarde, noite e itens sem horário." analise="periodo" dias={dias}>
            <GraficoColunas dados={dados.periodos.map((p) => ({ rotulo: PERIODO[p.periodo], valor: p.adesao, detalhe: `${p.feitos} de ${p.total}` }))} />
          </Cartao>

          <Cartao titulo="Adesão por dia da semana" descricao="Em quais dias a rotina mais segura." analise="diaSemana" dias={dias}>
            <GraficoColunas dados={dados.semana.map((d) => ({ rotulo: DIA_CURTO[d.diaSemana], valor: d.adesao, detalhe: `${d.feitos} de ${d.total}` }))} />
          </Cartao>

          <section aria-label="Tempo de foco" className="rounded-xl border bg-card p-5 lg:col-span-2">
            <h2 className="text-[15px] font-semibold">Tempo de foco</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Sessões de foco concluídas pelo cronômetro, por semana.</p>
            <div className="mt-4">
              {focos.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma sessão concluída ainda. Use &quot;Iniciar foco&quot; num cartão do Hoje.</p>
              ) : (() => {
                const semanas = focoPorSemana(focos, hoje, 8);
                const total = semanas.reduce((t, s) => t + s.minutos, 0);
                return (
                  <>
                    <p className="numeros mb-3 text-sm"><span className="text-2xl font-semibold">{Math.floor(total / 60)}h{String(total % 60).padStart(2, "0")}</span> <span className="text-muted-foreground">nas últimas 8 semanas, {semanas.reduce((t, s) => t + s.sessoes, 0)} sessões</span></p>
                    <GraficoMinutos dados={semanas.map((s) => ({ rotulo: s.de.slice(8, 10) + "/" + s.de.slice(5, 7), minutos: s.minutos, sessoes: s.sessoes }))} />
                  </>
                );
              })()}
            </div>
          </section>

          <Cartao titulo="Hábitos que andam juntos" descricao="Quando fazer um aumenta a chance de fazer outro no mesmo dia." analise="coocorrencia" dias={dias} largo>
            {dados.pares.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum par com efeito claro (20 pontos ou mais) por enquanto.</p>
            ) : (
              <ul className="space-y-2.5">
                {dados.pares.map((p) => (
                  <li key={`${p.a}-${p.b}`} className="text-sm">
                    Nos dias com <strong className="font-medium">{nome.get(p.a)}</strong>, <strong className="font-medium">{nome.get(p.b)}</strong> sai em{" "}
                    <span className="numeros">{pct(p.pComA)}</span> das vezes; sem, em <span className="numeros">{pct(p.pSemA)}</span>.
                    <span className="numeros block text-xs text-muted-foreground">{p.dias} dias em que os dois valiam</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}

function Cartao({ titulo, descricao, analise, dias, largo, children }: {
  titulo: string; descricao: string; analise: Analise; dias: number; largo?: boolean; children: React.ReactNode;
}) {
  const e = estadoLimiar(analise, dias);
  return (
    <section aria-label={titulo} className={cn("rounded-xl border bg-card p-5", largo && "lg:col-span-2")}>
      <h2 className="text-[15px] font-semibold">{titulo}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
      <div className="mt-4">
        {e.pronto ? children : (
          <div className="grid place-items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center">
            <Lock className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Faltam {e.faltam} {e.faltam === 1 ? "dia" : "dias"} de registro</p>
            <div className="w-40" aria-hidden>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-muted-foreground/60" style={{ width: `${(Math.min(dias, e.exige) / e.exige) * 100}%` }} />
              </div>
              <p className="numeros mt-1.5 text-xs text-muted-foreground">{Math.min(dias, e.exige)} de {e.exige} dias</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Barras horizontais (ranking com rótulos longos): uma cor, valor em texto ao lado. */
function Barras({ itens }: { itens: { chave: string; rotulo: string; valor: number | null; detalhe: string }[] }) {
  return (
    <ul className="space-y-2">
      {itens.map((it) => (
        <li key={it.chave} className="grid grid-cols-[minmax(0,10rem)_1fr_5.5rem] items-center gap-3 text-xs" title={`${it.rotulo}: ${pct(it.valor)} (${it.detalhe})`}>
          <span className="truncate">{it.rotulo}</span>
          <span className="h-2 overflow-hidden rounded-full bg-secondary">
            <span className="block h-full rounded-full" style={{ width: `${(it.valor ?? 0) * 100}%`, background: COR_DADO }} />
          </span>
          <span className="numeros text-right text-muted-foreground"><span className="text-foreground">{pct(it.valor)}</span> {it.detalhe}</span>
        </li>
      ))}
    </ul>
  );
}

/** Colunas verticais (categorias curtas e ordenadas): série única, sem legenda, com tooltip. */
function GraficoColunas({ dados }: { dados: { rotulo: string; valor: number | null; detalhe: string }[] }) {
  const linhas = dados.map((d) => ({ ...d, pct: d.valor === null ? 0 : Math.round(d.valor * 100) }));
  return (
    <div className="h-52" role="img" aria-label={linhas.map((d) => `${d.rotulo} ${d.valor === null ? "sem dados" : `${d.pct}%`}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={linhas} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
          <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof linhas)[number];
              return (
                <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                  <p className="font-medium">{d.rotulo}</p>
                  <p className="numeros text-muted-foreground">{d.valor === null ? "sem dados" : `${d.pct}% (${d.detalhe})`}</p>
                </div>
              );
            }} />
          <Bar dataKey="pct" fill={COR_DADO} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Minutos de foco por semana: série única, uma cor, tooltip com as sessões. */
function GraficoMinutos({ dados }: { dados: { rotulo: string; minutos: number; sessoes: number }[] }) {
  return (
    <div className="h-48" role="img" aria-label={dados.map((d) => `semana de ${d.rotulo}: ${d.minutos} minutos`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v) => `${v}m`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
          <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof dados)[number];
              return (
                <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                  <p className="font-medium">Semana de {d.rotulo}</p>
                  <p className="numeros text-muted-foreground">{d.minutos} min em {d.sessoes} {d.sessoes === 1 ? "sessão" : "sessões"}</p>
                </div>
              );
            }} />
          <Bar dataKey="minutos" fill={COR_DADO} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
