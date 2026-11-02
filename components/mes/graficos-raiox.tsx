"use client";

import { useState } from "react";
import { gap, quadrante } from "@motor";
import { cn } from "@/lib/utils";

export interface ItemGrafico {
  numero: number;
  areaId: string;
  nome: string;
  importancia: number;
  acao: number;
  meta: number | null; // meta de ação do foco do mês
  gapAnterior: number | null; // gap no mês anterior (para comparar)
}

/** Cor pela polaridade do gap: falta ação (coral), equilíbrio (cinza), energia demais (violeta). */
export const corDoGap = (g: number) => (g >= 1 ? "var(--gap-falta)" : g <= -1 ? "var(--gap-excesso)" : "var(--muted-foreground)");
const sinal = (g: number) => (g > 0 ? `+${g}` : String(g));
const pos = (v: number, min: number, max: number) => `${((v - min) / (max - min)) * 100}%`;

function Dica({ dica }: { dica: { x: number; y: number; texto: string[] } | null }) {
  if (!dica) return null;
  return (
    <div role="tooltip" className="pointer-events-none absolute z-10 w-max max-w-56 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
      style={{ left: dica.x, top: dica.y }}>
      <p className="font-medium text-foreground">{dica.texto[0]}</p>
      {dica.texto.slice(1).map((t) => <p key={t} className="numeros text-muted-foreground">{t}</p>)}
    </div>
  );
}

/** "Onde está o gap": importância (●), ação hoje (○) e meta do mês (◌) por área, do maior gap para o menor. */
export function GraficoGap({ itens }: { itens: ItemGrafico[] }) {
  const [dica, setDica] = useState<{ x: number; y: number; texto: string[] } | null>(null);
  const ordenados = [...itens].sort((a, b) => gap(b)! - gap(a)!);
  return (
    <figure className="relative" onMouseLeave={() => setDica(null)}>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-foreground" />importância</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-muted-foreground bg-card" />ação hoje</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-dashed border-muted-foreground" />meta do mês</span>
        <span className="flex items-center gap-1.5"><span className="h-1 w-4 rounded-full bg-gap-falta" />falta ação</span>
        <span className="flex items-center gap-1.5"><span className="h-1 w-4 rounded-full bg-gap-excesso" />energia demais</span>
      </div>
      <div className="grid grid-cols-[minmax(0,6.5rem)_1fr_2.75rem] sm:grid-cols-[minmax(0,9rem)_1fr_3.25rem] items-center gap-x-3 text-[11px] text-muted-foreground" aria-hidden>
        <span />
        <div className="relative h-4">
          {[0, 2, 4, 6, 8, 10].map((t) => <span key={t} className="numeros absolute -translate-x-1/2" style={{ left: pos(t, 0, 10) }}>{t}</span>)}
        </div>
        <span className="text-right">gap</span>
      </div>
      <ul className="mt-1 space-y-0.5">
        {ordenados.map((i) => {
          const g = gap(i)!;
          const cor = corDoGap(g);
          const [lo, hi] = [Math.min(i.importancia, i.acao), Math.max(i.importancia, i.acao)];
          const texto = [i.nome, `importância ${i.importancia} · ação ${i.acao} · gap ${sinal(g)}`, ...(i.meta ? [`meta do mês: ação ${i.meta}`] : []), ...(i.gapAnterior !== null ? [`mês anterior: gap ${sinal(i.gapAnterior)}`] : [])];
          return (
            <li key={i.areaId} className="grid grid-cols-[minmax(0,6.5rem)_1fr_2.75rem] sm:grid-cols-[minmax(0,9rem)_1fr_3.25rem] items-center gap-x-3 rounded-md py-1.5 hover:bg-accent/40"
              onMouseMove={(e) => {
                const caixa = (e.currentTarget.closest("figure") as HTMLElement).getBoundingClientRect();
                setDica({ x: e.clientX - caixa.left, y: e.clientY - caixa.top, texto });
              }}>
              <span className="truncate text-xs font-medium" title={i.nome}>{i.nome}</span>
              <div className="relative h-3">
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
                <span className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ left: pos(lo, 0, 10), width: `calc(${pos(hi, 0, 10)} - ${pos(lo, 0, 10)})`, background: cor }} />
                {i.meta && i.meta > i.acao && (
                  <span className="absolute top-1/2 size-3 -translate-1/2 rounded-full border-2 border-dashed border-muted-foreground" style={{ left: pos(i.meta, 0, 10) }} />
                )}
                <span className="absolute top-1/2 size-3 -translate-1/2 rounded-full border-2 border-card bg-foreground" style={{ left: pos(i.importancia, 0, 10) }} />
                <span className="absolute top-1/2 size-3 -translate-1/2 rounded-full border-2 bg-card" style={{ left: pos(i.acao, 0, 10), borderColor: "var(--muted-foreground)" }} />
              </div>
              <span className="numeros justify-self-end rounded px-1.5 py-0.5 text-xs font-semibold" style={{ color: cor, background: `color-mix(in oklab, ${cor} 14%, transparent)` }}>
                {sinal(g)}
              </span>
            </li>
          );
        })}
      </ul>
      <Dica dica={dica} />
      <table className="sr-only">
        <caption>Gap por área (importância menos ação)</caption>
        <thead><tr><th>Área</th><th>Importância</th><th>Ação</th><th>Gap</th><th>Meta</th></tr></thead>
        <tbody>{ordenados.map((i) => <tr key={i.areaId}><td>{i.nome}</td><td>{i.importancia}</td><td>{i.acao}</td><td>{gap(i)}</td><td>{i.meta ?? "-"}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

const QUADRANTES = [
  { id: "prioridade", rotulo: "Prioridade", classe: "left-0 top-0 items-start justify-start", fundo: "color-mix(in oklab, var(--gap-falta) 13%, transparent)" },
  { id: "em_dia", rotulo: "Em dia", classe: "right-0 top-0 items-start justify-end", fundo: "color-mix(in oklab, var(--feito) 9%, transparent)" },
  { id: "pode_esperar", rotulo: "Pode esperar", classe: "left-0 bottom-0 items-end justify-start", fundo: "transparent" },
  { id: "energia_demais", rotulo: "Energia demais?", classe: "right-0 bottom-0 items-end justify-end", fundo: "color-mix(in oklab, var(--gap-excesso) 11%, transparent)" },
] as const;

/** Mapa de prioridades: ação no eixo X, importância no eixo Y (1 a 10). O canto de cima à esquerda é por onde começar. */
export function MapaPrioridades({ itens }: { itens: ItemGrafico[] }) {
  const [dica, setDica] = useState<{ x: number; y: number; texto: string[] } | null>(null);
  // Escala de 0,5 a 10,5: meia nota de folga nas bordas para os pontos 1 e 10 não ficarem cortados.
  const px = (v: number) => pos(v, 0.5, 10.5);
  const py = (v: number) => pos(11 - v, 0.5, 10.5);
  // Pontos na mesma posição se afastam um pouco para os números não se cobrirem.
  const vistos = new Map<string, number>();
  const pontos = itens.map((i) => {
    const chave = `${i.acao}|${i.importancia}`;
    const n = vistos.get(chave) ?? 0;
    vistos.set(chave, n + 1);
    return { ...i, dx: n * 14, dy: n * -6 };
  });
  return (
    <figure className="relative" onMouseLeave={() => setDica(null)}>
      <div className="flex gap-2">
        <div className="flex w-4 items-center justify-center">
          <span className="-rotate-90 text-[11px] whitespace-nowrap text-muted-foreground">importância →</span>
        </div>
        <div className="flex-1">
          <div className="relative aspect-square w-full overflow-visible rounded-lg border">
            {QUADRANTES.map((q) => (
              <div key={q.id} className={cn("absolute flex h-1/2 w-1/2 p-2", q.classe)} style={{ background: q.fundo }}>
                <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{q.rotulo}</span>
              </div>
            ))}
            <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <line x1="0" y1="100" x2="100" y2="0" stroke="var(--border)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            </svg>
            {pontos.filter((p) => p.meta && p.meta > p.acao).map((p) => (
              <span key={`m-${p.areaId}`} aria-hidden className="absolute h-0 border-t-2 border-dashed border-muted-foreground/60"
                style={{ left: px(p.acao), width: `calc(${px(p.meta!)} - ${px(p.acao)})`, top: `calc(${py(p.importancia)})` }} />
            ))}
            {pontos.filter((p) => p.meta && p.meta > p.acao).map((p) => (
              <span key={`mc-${p.areaId}`} aria-hidden className="absolute size-4 -translate-1/2 rounded-full border-2 border-dashed border-muted-foreground bg-card"
                style={{ left: px(p.meta!), top: py(p.importancia) }} />
            ))}
            {pontos.map((p) => {
              const q = quadrante(p);
              const cor = q === "prioridade" ? "var(--gap-falta)" : q === "energia_demais" ? "var(--gap-excesso)" : q === "em_dia" ? "var(--feito)" : "var(--muted-foreground)";
              const texto = [`${p.numero}. ${p.nome}`, `importância ${p.importancia} · ação ${p.acao}`, ...(p.meta ? [`meta do mês: ação ${p.meta}`] : [])];
              return (
                <button key={p.areaId} type="button" aria-label={`${p.nome}: importância ${p.importancia}, ação ${p.acao}`}
                  onMouseEnter={(e) => {
                    const caixa = (e.currentTarget.closest("figure") as HTMLElement).getBoundingClientRect();
                    const r = e.currentTarget.getBoundingClientRect();
                    setDica({ x: r.left + r.width / 2 - caixa.left, y: r.top - caixa.top, texto });
                  }}
                  onFocus={(e) => {
                    const caixa = (e.currentTarget.closest("figure") as HTMLElement).getBoundingClientRect();
                    const r = e.currentTarget.getBoundingClientRect();
                    setDica({ x: r.left + r.width / 2 - caixa.left, y: r.top - caixa.top, texto });
                  }}
                  onBlur={() => setDica(null)}
                  className="numeros absolute grid size-6 place-items-center rounded-full border-2 border-card text-[10px] font-bold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ left: `calc(${px(p.acao)} + ${p.dx}px)`, top: `calc(${py(p.importancia)} + ${p.dy}px)`, transform: "translate(-50%, -50%)", background: cor }}>
                  {p.numero}
                </button>
              );
            })}
          </div>
          <div className="relative mt-1 h-4 text-[11px] text-muted-foreground" aria-hidden>
            {[1, 4, 7, 10].map((t) => <span key={t} className="numeros absolute -translate-x-1/2" style={{ left: px(t) }}>{t}</span>)}
          </div>
          <p className="text-center text-[11px] text-muted-foreground">ação →</p>
        </div>
      </div>
      <ol className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {itens.map((i) => (
          <li key={i.areaId} className="flex gap-2"><span className="numeros w-4 shrink-0 text-right font-semibold text-muted-foreground">{i.numero}</span><span className="truncate">{i.nome}</span>
            <span className="ml-auto shrink-0 text-muted-foreground">{({ prioridade: "prioridade", em_dia: "em dia", pode_esperar: "pode esperar", energia_demais: "energia demais" } as const)[quadrante(i)!]}</span></li>
        ))}
      </ol>
      <Dica dica={dica} />
    </figure>
  );
}
