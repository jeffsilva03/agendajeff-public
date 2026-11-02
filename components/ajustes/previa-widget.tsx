"use client";

import { useState } from "react";
import { ArrowRightCircle, CalendarDays, Circle, CircleAlert, Flame, ListChecks, Quote, RotateCw, Target } from "lucide-react";
import type { ResumoWidget } from "@/lib/widget";
import { cn } from "@/lib/utils";

// Espelho em HTML do desenho do widget do Scriptable (mesmas cores, blocos e proporções), para ver antes de instalar.
const C = { texto: "#f1f3f7", suave: "#9aa3b2", apagado: "#5d6573", feito: "#3ccf86", aviso: "#f0b544", azul: "#6b93f5" };

function Anel({ pct, lado, espessura, legenda }: { pct: number; lado: number; espessura: number; legenda?: string }) {
  const r = (lado - espessura) / 2;
  const volta = 2 * Math.PI * r;
  return (
    <svg width={lado} height={lado} viewBox={`0 0 ${lado} ${lado}`} aria-hidden>
      <circle cx={lado / 2} cy={lado / 2} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={espessura} />
      {pct > 0 && <circle cx={lado / 2} cy={lado / 2} r={r} fill="none" stroke={C.feito} strokeWidth={espessura} strokeLinecap="round"
        strokeDasharray={`${volta * Math.min(1, pct)} ${volta}`} transform={`rotate(-90 ${lado / 2} ${lado / 2})`} />}
      <text x="50%" y={legenda ? "48%" : "54%"} textAnchor="middle" fill={C.texto} fontSize={lado * 0.22} fontWeight={700}>{Math.round(pct * 100)}%</text>
      {legenda && <text x="50%" y="66%" textAnchor="middle" fill={C.suave} fontSize={lado * 0.12} fontWeight={500}>{legenda}</text>}
    </svg>
  );
}

function Atualizado({ d }: { d: ResumoWidget }) {
  return <span className="flex shrink-0 items-center gap-0.5 text-[9px] font-medium" style={{ color: C.apagado }}><RotateCw className="size-2" />{d.atualizado.replace(":", "h")}</span>;
}
function Cartao({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[14px] border border-white/[0.08] bg-white/[0.06] px-[11px] py-[9px]">{children}</div>;
}
function Rotulo({ Icone, texto, cor }: { Icone: typeof Target; texto: string; cor: string }) {
  return <p className="flex items-center gap-1 text-[9px] font-semibold tracking-wide uppercase" style={{ color: cor }}><Icone className="size-2.5" />{texto}</p>;
}
function Proximo({ d, compacto }: { d: ResumoWidget; compacto?: boolean }) {
  return (
    <Cartao>
      <Rotulo Icone={ArrowRightCircle} texto={d.proximo ? "Próximo" : "Hábitos"} cor={d.proximo ? C.feito : C.suave} />
      <p className={cn("mt-0.5 line-clamp-2 font-semibold", compacto ? "text-[13px]" : "text-[15px]")} style={{ color: C.texto }}>
        {d.proximo?.nome ?? (d.habitos.total ? "Dia fechado" : "Sem hábitos hoje")}
      </p>
      {!compacto && d.proximo && <p className="text-[10px] font-medium" style={{ color: C.suave }}>{d.proximo.grupo}</p>}
    </Cartao>
  );
}
function Tarefas({ d, limite }: { d: ResumoWidget; limite: number }) {
  return (
    <Cartao>
      <Rotulo Icone={ListChecks} texto={d.tarefasTotal ? `Tarefas · ${d.tarefasTotal}` : "Tarefas"} cor={C.azul} />
      <div className="mt-1 space-y-0.5">
        {d.tarefas.length ? d.tarefas.slice(0, limite).map((t) => (
          <p key={t.titulo} className="flex items-center gap-1.5 truncate text-[11px] font-medium" style={{ color: C.texto }}>
            {t.importante ? <CircleAlert className="size-2.5 shrink-0" style={{ color: C.aviso }} /> : <Circle className="size-2.5 shrink-0" style={{ color: C.apagado }} />}
            <span className="truncate">{t.titulo}</span>{t.hora && <span style={{ color: C.suave }}>{t.hora}</span>}
          </p>
        )) : <p className="text-[11px]" style={{ color: C.suave }}>Nada pendente</p>}
      </div>
    </Cartao>
  );
}
function Agenda({ d, limite }: { d: ResumoWidget; limite: number }) {
  return (
    <Cartao>
      <Rotulo Icone={CalendarDays} texto="Agenda" cor={C.aviso} />
      <div className="mt-1 space-y-0.5">
        {d.agenda.length ? d.agenda.slice(0, limite).map((a) => (
          <p key={a.titulo} className="flex gap-1.5 truncate text-[11px] font-medium" style={{ color: C.texto }}>
            <span className="font-semibold" style={{ color: C.aviso }}>{a.hora}</span><span className="truncate">{a.titulo}</span>
          </p>
        )) : <p className="text-[11px]" style={{ color: C.suave }}>Nada mais hoje</p>}
      </div>
    </Cartao>
  );
}

export function PreviaWidget({ d }: { d: ResumoWidget }) {
  const [tamanho, setTamanho] = useState<"pequeno" | "medio" | "grande">("medio");
  const caixa = { pequeno: "w-[170px] h-[170px]", medio: "w-[360px] h-[170px]", grande: "w-[360px] h-[378px]" }[tamanho];
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Tamanho do widget" className="flex gap-1">
        {(["pequeno", "medio", "grande"] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tamanho === t} onClick={() => setTamanho(t)}
            className={cn("rounded-md px-2.5 py-1 text-xs", tamanho === t ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent")}>
            {t === "medio" ? "Médio" : t === "pequeno" ? "Pequeno" : "Grande"}
          </button>
        ))}
      </div>
      <div role="status" aria-label="Prévia do widget"
        className={cn("max-w-full overflow-hidden rounded-[22px] shadow-xl", caixa)}
        style={{ background: "linear-gradient(135deg, #171b22, #0b0d11)" }}>
        {tamanho === "pequeno" && (
          <div className="flex h-full flex-col p-3">
            <div className="flex items-center justify-between">
              <Anel pct={d.habitos.pct} lado={54} espessura={6} legenda={`${d.habitos.feitos}/${d.habitos.total}`} />
              <div className="text-right"><p className="text-[13px] font-bold" style={{ color: C.texto }}>{d.dia.split(",")[0]}</p><p className="text-[10px] font-medium" style={{ color: C.suave }}>{d.dia.split(",")[1]}</p></div>
            </div>
            <div className="mt-auto">
              <Rotulo Icone={ArrowRightCircle} texto={d.proximo ? "Próximo" : "Hábitos"} cor={d.proximo ? C.feito : C.suave} />
              <p className="line-clamp-2 text-[13px] font-semibold" style={{ color: C.texto }}>{d.proximo?.nome ?? "Dia fechado"}</p>
              <p className="mt-1 flex items-center justify-between text-[10px] font-medium" style={{ color: C.suave }}>{d.tarefasTotal ? `${d.tarefasTotal} ${d.tarefasTotal === 1 ? "tarefa" : "tarefas"}` : "Sem tarefas"}<Atualizado d={d} /></p>
            </div>
          </div>
        )}
        {tamanho === "medio" && (
          <div className="flex h-full gap-2.5 px-3.5 py-3">
            <div className="w-[104px] shrink-0">
              <Anel pct={d.habitos.pct} lado={66} espessura={7} legenda={`${d.habitos.feitos}/${d.habitos.total}`} />
              <p className="mt-1.5 text-[12px] font-bold" style={{ color: C.texto }}>{d.dia}</p>
              {d.sequencia && <p className="flex items-center gap-0.5 text-[9px] font-medium" style={{ color: C.suave }}><Flame className="size-2.5" style={{ color: C.aviso }} />{d.sequencia.dias} dias seguidos</p>}
              <div className="mt-1"><Atualizado d={d} /></div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Proximo d={d} compacto />
              {d.agenda.length && !d.tarefas.length ? <Agenda d={d} limite={2} /> : <Tarefas d={d} limite={2} />}
            </div>
          </div>
        )}
        {tamanho === "grande" && (
          <div className="flex h-full flex-col px-[15px] pt-[15px] pb-[13px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[15px] font-bold" style={{ color: C.texto }}>{d.dia}</p>
                <p className="flex items-center gap-1 text-[10px] font-medium" style={{ color: C.suave }}>
                  {d.sequencia ? <><Flame className="size-2.5" style={{ color: C.aviso }} />{d.sequencia.dias} dias · {d.sequencia.nome}</> : `${d.habitos.feitos} de ${d.habitos.total} hábitos`}
                </p>
              </div>
              <Anel pct={d.habitos.pct} lado={40} espessura={5} />
            </div>
            <div className="mt-2.5"><Proximo d={d} /></div>
            <div className="mt-2 grid grid-cols-2 gap-2"><Tarefas d={d} limite={4} /><Agenda d={d} limite={4} /></div>
            {d.metas.length > 0 && (
              <div className="mt-2">
                <Cartao>
                  <Rotulo Icone={Target} texto="Metas do mês" cor={C.feito} />
                  <div className="mt-1.5 space-y-1.5">
                    {d.metas.slice(0, 3).map((m) => (
                      <div key={m.titulo}>
                        <p className="flex justify-between text-[11px] font-medium" style={{ color: C.texto }}><span className="truncate">{m.titulo}</span><span className="font-semibold" style={{ color: C.suave }}>{m.texto}</span></p>
                        {m.pct !== null && <div className="mt-0.5 h-1 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, m.pct * 100))}%`, background: m.pct >= 1 ? C.feito : C.azul }} /></div>}
                      </div>
                    ))}
                  </div>
                </Cartao>
              </div>
            )}
            <p className="mt-auto flex items-start gap-1 pt-2 text-[10px] font-medium" style={{ color: C.suave }}><Quote className="mt-0.5 size-2.5 shrink-0" style={{ color: C.apagado }} /><span className="line-clamp-2 flex-1">{d.frase}</span><Atualizado d={d} /></p>
          </div>
        )}
      </div>
    </div>
  );
}
