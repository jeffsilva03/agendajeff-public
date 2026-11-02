"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { gap, progressoMeta, resumoDoMes, resumoRaiox, somarMeses } from "@motor";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { salvarRevisao, type CamposRevisao } from "@/lib/mes";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { rotuloSituacao } from "./metas";
import { nomeDoMes, type DadosMes } from "./tela-mes";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const horas = (h: number) => `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

const PERGUNTAS: { campo: keyof CamposRevisao; titulo: string; dica: string }[] = [
  { campo: "funcionou", titulo: "O que funcionou", dica: "O que você quer repetir no próximo mês?" },
  { campo: "nao_funcionou", titulo: "O que não funcionou", dica: "Sem julgamento: onde a rotina travou?" },
  { campo: "aprendi", titulo: "O que eu aprendi", dica: "Sobre você, sua rotina ou seu jeito de trabalhar." },
  { campo: "foco_proximo", titulo: "Foco do próximo mês", dica: "Uma frase. Ela pode virar meta ou foco no Raio-X." },
];

export function AbaRevisao(d: DadosMes) {
  const sb = useMemo(() => criarClienteNavegador(), []);
  const [respostas, setRespostas] = useState<CamposRevisao>({
    nota: d.revisao?.nota ?? null, funcionou: d.revisao?.funcionou ?? "", nao_funcionou: d.revisao?.nao_funcionou ?? "",
    aprendi: d.revisao?.aprendi ?? "", foco_proximo: d.revisao?.foco_proximo ?? "",
  });
  const [salvo, setSalvo] = useState<"ok" | "salvando" | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendentes = useRef<CamposRevisao>({}); // tudo o que mudou desde o último salvamento
  useEffect(() => () => clearTimeout(temporizador.current), []);

  function alterar(campos: CamposRevisao) {
    setRespostas((r) => ({ ...r, ...campos }));
    pendentes.current = { ...pendentes.current, ...campos };
    setSalvo("salvando");
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      const lote = pendentes.current;
      pendentes.current = {};
      salvarRevisao(sb, d.mes, lote).then(() => setSalvo("ok"), (e) => {
        pendentes.current = { ...lote, ...pendentes.current };
        setSalvo(null);
        toast.error((e as Error).message);
      });
    }, 700);
  }

  const resumo = resumoDoMes(d.ctx, d.checks, d.mes, d.hoje);
  const nome = new Map(d.ctx.habitos.map((h) => [h.id, h.nome]));
  const ordenados = [...resumo.porHabito].sort((a, b) => (b.adesao ?? 0) - (a.adesao ?? 0));
  const metas = d.metas.map((m) => ({ m, p: progressoMeta(m, d.checks, d.hoje) }));
  const notasMes = d.notas.filter((n) => n.mes === d.mes);
  const notasAnt = d.notas.filter((n) => n.mes === somarMeses(d.mes, -1));
  const rx = resumoRaiox(notasMes), rxAnt = resumoRaiox(notasAnt);
  const nomeArea = new Map(d.areas.map((a) => [a.id, a.nome]));
  const focos = notasMes.filter((n) => n.foco);
  const futuro = d.mes > d.hoje;

  return (
    <div className="space-y-6">
      {futuro && <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">Este mês ainda não começou: os números aparecem conforme os dias passam.</p>}

      <section aria-label="Números do mês" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4">
        {[
          ["Adesão aos hábitos", pct(resumo.adesao), resumo.comecou ? `${resumo.diasComRegistro} dias com registro` : "acompanhamento não começou"],
          ["Tarefas concluídas", `${d.numeros.tarefas.feitas} de ${d.numeros.tarefas.total}`, "com data no mês"],
          ["Horas de freela", horas(d.numeros.horasFreela), `${d.numeros.candidaturas} ${d.numeros.candidaturas === 1 ? "candidatura enviada" : "candidaturas enviadas"}`],
          ["Tempo de foco", d.numeros.minutosFoco ? horas(d.numeros.minutosFoco / 60) : "—", "sessões do cronômetro"],
        ].map(([r, v, n]) => (
          <div key={r} className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{r}</p>
            <p className="numeros mt-1 text-2xl font-semibold">{v}</p>
            <p className="text-xs text-muted-foreground">{n}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Hábitos no mês</h2>
          {ordenados.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Sem registros neste mês ainda.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {ordenados.map((h) => (
                <li key={h.habitoId} className="grid grid-cols-[minmax(0,1fr)_6rem_2.75rem] items-center gap-3 text-sm">
                  <span className="truncate">{nome.get(h.habitoId)}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden><span className="block h-full rounded-full bg-feito" style={{ width: pct(h.adesao) }} /></span>
                  <span className="numeros text-right text-xs text-muted-foreground">{pct(h.adesao)}</span>
                </li>
              ))}
            </ul>
          )}
          {ordenados.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Mínimo conta como feito; “não se aplica” e dias sem nenhum registro ficam fora da conta.</p>}
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Metas do mês</h2>
          {metas.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma meta em {nomeDoMes(d.mes)}. <Link href={`/mes${d.mes.slice(0, 7) !== d.hoje.slice(0, 7) ? `?mes=${d.mes.slice(0, 7)}` : ""}`} className="underline underline-offset-2">Criar metas</Link></p>
          ) : (
            <ul className="mt-3 space-y-2">
              {metas.map(({ m, p }) => {
                const s = rotuloSituacao(m, p.situacao);
                return (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{m.titulo}</span>
                    {p.alvo !== null && m.tipo !== "marco" && <span className="numeros text-xs text-muted-foreground">{p.atual}/{p.alvo}</span>}
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium", s.classe)}><s.Icone className="size-3" aria-hidden />{s.rotulo}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Raio-X da vida</h2>
          {rx.avaliadas === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Raio-X deste mês ainda não feito. <Link href={`/mes?aba=raiox${d.mes.slice(0, 7) !== d.hoje.slice(0, 7) ? `&mes=${d.mes.slice(0, 7)}` : ""}`} className="underline underline-offset-2">Fazer agora</Link></p>
          ) : (
            <div className="mt-2 space-y-2 text-sm">
              <p className="numeros">Distância média entre importância e ação: <strong>{rx.gapMedio!.toFixed(1).replace(".", ",")}</strong>
                {rxAnt.gapMedio !== null && <> (mês anterior {rxAnt.gapMedio.toFixed(1).replace(".", ",")})</>}. {rx.emAtencao} {rx.emAtencao === 1 ? "área pede" : "áreas pedem"} atenção.</p>
              {focos.length > 0 && (
                <ul className="space-y-1">
                  {focos.map((f) => <li key={f.area_id} className="numeros text-muted-foreground"><span className="text-foreground">{nomeArea.get(f.area_id)}</span>: ação {f.acao ?? "–"} → meta {f.meta_acao ?? "–"} (gap {gap(f) ?? "–"})</li>)}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Para medir a evolução, refaça o Raio-X no começo do próximo mês.</p>
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Faculdade no mês</h2>
          {d.numeros.avaliacoes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma prova, trabalho ou atividade com data neste mês.</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {d.numeros.avaliacoes.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  {a.entregue ? <Check className="size-3.5 shrink-0 text-feito" aria-label="entregue" /> : <span className="size-3.5 shrink-0 rounded-full border-2 border-input" aria-label="pendente" />}
                  <span className="min-w-0 flex-1 truncate">{a.titulo}{a.disciplina && <span className="text-muted-foreground"> · {a.disciplina}</span>}</span>
                  {a.nota !== null && <span className="numeros font-medium">{a.nota.toLocaleString("pt-BR")}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="t-reflexao" className="rounded-xl border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="t-reflexao" className="text-lg font-semibold tracking-tight">Reflexão de {nomeDoMes(d.mes)}</h2>
          <span className="text-xs text-muted-foreground" aria-live="polite">{salvo === "salvando" ? "Salvando…" : salvo === "ok" ? "Salvo" : ""}</span>
        </div>
        <div className="mt-4">
          <span className="text-sm font-medium">Nota do mês</span>
          <div role="radiogroup" aria-label="Nota do mês" className="mt-2 flex flex-wrap gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={respostas.nota === n} onClick={() => alterar({ nota: respostas.nota === n ? null : n })}
                className={cn("numeros size-9 rounded-md border text-sm", respostas.nota === n ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent")}>{n}</button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {PERGUNTAS.map((q) => (
            <label key={q.campo} className="block space-y-1">
              <span className="text-sm font-medium">{q.titulo}</span>
              <Textarea rows={3} value={(respostas[q.campo] as string) ?? ""} placeholder={q.dica} maxLength={2000}
                onChange={(e) => alterar({ [q.campo]: e.target.value })} />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
