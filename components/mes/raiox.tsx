"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Plus, Target, X } from "lucide-react";
import { areasParaPlano, gap, porGap, resumoRaiox, somarMeses, tipoGap } from "@motor";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { criarArea, excluirArea, garantirAreas, salvarMesRaiox, salvarMeta, salvarNota, type CamposNota } from "@/lib/mes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GraficoGap, MapaPrioridades, corDoGap, type ItemGrafico } from "./graficos-raiox";
import { nomeDoMes, type Area, type DadosMes, type NotaLinha } from "./tela-mes";

type Nota = Omit<NotaLinha, "mes" | "area_id">;
const VAZIA: Nota = { importancia: null, acao: null, valor: null, compromisso: null, foco: false, meta_acao: null, como_medir: null };
const ROTULO_GAP = { atencao: "atenção", leve: "leve", equilibrio: "equilíbrio", excesso: "excesso" } as const;
const sinal = (g: number) => (g > 0 ? `+${g}` : String(g));

function Passo({ n, titulo, descricao, children, id }: { n: string; titulo: string; descricao: string; children: React.ReactNode; id: string }) {
  return (
    <section id={id} aria-labelledby={`t-${id}`} className="scroll-mt-4 rounded-xl border bg-card p-4 md:p-5">
      <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <span className="numeros grid size-5 place-items-center rounded-full bg-foreground text-[10px] text-background">{n}</span>
        {n === "R" ? "Resultado" : `Passo ${n}`}
      </p>
      <h2 id={`t-${id}`} className="mt-1 text-lg font-semibold tracking-tight">{titulo}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Regua({ rotulo, valor, onChange, tom }: { rotulo: string; valor: number | null; onChange: (v: number) => void; tom: "forte" | "suave" }) {
  return (
    <label className="grid grid-cols-[4.5rem_1fr_1.5rem] items-center gap-2 text-xs text-muted-foreground">
      {rotulo}
      <input type="range" min={1} max={10} step={1} value={valor ?? 5} aria-label={rotulo}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn("h-1.5 w-full cursor-pointer", valor === null && "opacity-40")}
        style={{ accentColor: tom === "forte" ? "var(--foreground)" : "var(--ring)" }} />
      <span className="numeros text-right font-semibold text-foreground">{valor ?? "–"}</span>
    </label>
  );
}

export function AbaRaiox(d: DadosMes) {
  const router = useRouter();
  const sb = useMemo(() => criarClienteNavegador(), []);
  const [areas, setAreas] = useState<Area[]>(d.areas);
  const [notas, setNotas] = useState<Map<string, Nota>>(() => new Map(d.notas.filter((n) => n.mes === d.mes).map((n) => [n.area_id, n])));
  const anteriores = useMemo(() => new Map(d.notas.filter((n) => n.mes === somarMeses(d.mes, -1)).map((n) => [n.area_id, n])), [d.notas, d.mes]);
  const [mesInfo, setMesInfo] = useState({ o_que_sai: d.raioxMes?.o_que_sai ?? "", checkin: d.raioxMes?.checkin ?? "" });
  const [novaArea, setNovaArea] = useState("");
  const [verTodas, setVerTodas] = useState(false);
  const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Primeira vez: cria as áreas sugeridas.
  useEffect(() => {
    if (areas.length) return;
    garantirAreas(sb).then(setAreas).catch((e) => toast.error((e as Error).message));
  }, [sb, areas.length]);
  useEffect(() => () => { for (const t of temporizadores.current.values()) clearTimeout(t); }, []);

  const nota = (id: string) => notas.get(id) ?? VAZIA;
  /** Atualiza na tela na hora e grava no banco logo depois (agrupando os movimentos da régua). */
  function alterar(areaId: string, campos: CamposNota, atraso = 500) {
    setNotas((m) => new Map(m).set(areaId, { ...(m.get(areaId) ?? VAZIA), ...campos } as Nota));
    const chave = `${areaId}:${Object.keys(campos).join(",")}`;
    clearTimeout(temporizadores.current.get(chave));
    temporizadores.current.set(chave, setTimeout(() => {
      salvarNota(sb, d.mes, areaId, campos).catch((e) => toast.error((e as Error).message));
    }, atraso));
  }
  const mesPendente = useRef<{ o_que_sai?: string; checkin?: string }>({});
  function alterarMes(campos: { o_que_sai?: string; checkin?: string }) {
    setMesInfo((m) => ({ ...m, ...campos }));
    mesPendente.current = { ...mesPendente.current, ...campos };
    clearTimeout(temporizadores.current.get("mes"));
    temporizadores.current.set("mes", setTimeout(() => {
      const lote = mesPendente.current;
      mesPendente.current = {};
      salvarMesRaiox(sb, d.mes, lote).catch((e) => toast.error((e as Error).message));
    }, 600));
  }

  const linhas = areas.map((a) => ({ areaId: a.id, nome: a.nome, ...nota(a.id) }));
  const avaliadas = linhas.filter((l) => gap(l) !== null);
  const plano = areasParaPlano(linhas);
  const outras = porGap(linhas).filter((l) => !plano.includes(l));
  const focos = linhas.filter((l) => l.foco);
  const resumo = resumoRaiox(linhas);
  const resumoAnterior = resumoRaiox([...anteriores.values()]);
  const numero = new Map(areas.map((a, i) => [a.id, i + 1]));
  const itensGrafico: ItemGrafico[] = avaliadas.map((l) => {
    const ant = anteriores.get(l.areaId);
    return { numero: numero.get(l.areaId)!, areaId: l.areaId, nome: l.nome, importancia: l.importancia!, acao: l.acao!, meta: l.foco ? l.meta_acao : null, gapAnterior: ant ? gap(ant) : null };
  });
  const podeCopiar = notas.size === 0 && anteriores.size > 0;

  async function copiarAnterior() {
    for (const [areaId, n] of anteriores) {
      if (!areas.some((a) => a.id === areaId) || n.importancia == null || n.acao == null) continue;
      alterar(areaId, { importancia: n.importancia, acao: n.acao }, 0);
    }
    toast.success("Notas do mês anterior copiadas. Ajuste o que mudou.");
  }

  async function adicionarArea(e: React.FormEvent) {
    e.preventDefault();
    const nome = novaArea.trim();
    if (!nome) return;
    if (areas.some((a) => a.nome.toLowerCase() === nome.toLowerCase())) return toast.error("Essa área já existe.");
    try {
      const a = await criarArea(sb, nome, areas.length);
      setAreas((l) => [...l, a]);
      setNovaArea("");
    } catch (err) { toast.error((err as Error).message); }
  }

  async function removerArea(a: Area) {
    if (!confirm(`Remover a área "${a.nome}"? As notas dela em todos os meses saem junto.`)) return;
    try { await excluirArea(sb, a.id); setAreas((l) => l.filter((x) => x.id !== a.id)); }
    catch (err) { toast.error((err as Error).message); }
  }

  function alternarFoco(areaId: string) {
    const atual = nota(areaId);
    if (!atual.foco && focos.length >= 3) return toast("Escolha até 3 áreas. Mais do que isso vira lista de desejos.");
    alterar(areaId, { foco: !atual.foco, meta_acao: !atual.foco ? Math.min(10, (atual.acao ?? 5) + 2) : atual.meta_acao }, 0);
  }

  async function criarMetas() {
    try {
      for (const f of focos) {
        const titulo = `${f.nome}: ação ${f.acao ?? "?"} → ${f.meta_acao ?? "?"}`;
        const existente = d.metas.find((m) => m.origem === "raiox" && m.areaId === f.areaId);
        await salvarMeta(sb, d.mes, { titulo, tipo: "marco", alvo: null, unidade: null, habitoId: null, areaId: f.areaId, comoMedir: f.como_medir }, existente?.id, "raiox");
      }
      toast.success(`${focos.length === 1 ? "Meta criada" : "Metas criadas"} na aba Metas.`);
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  const etapas = [
    { id: "avaliacao", n: "1", titulo: "Avaliação", feito: `${avaliadas.length} de ${areas.length} áreas` },
    { id: "plano", n: "2", titulo: "Valores e plano", feito: `${plano.filter((p) => p.compromisso?.trim()).length} de ${plano.length} compromissos` },
    { id: "foco", n: "3", titulo: "Foco do mês", feito: `${focos.length} de 3 áreas` },
    { id: "diagnostico", n: "R", titulo: "Diagnóstico do mês", feito: avaliadas.length >= 3 ? "pronto" : "avalie 3 áreas ou mais" },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4 md:p-5">
        <p className="text-sm text-muted-foreground">
          Duas notas de 1 a 10 para cada área: <strong className="text-foreground">o quanto ela importa</strong> e <strong className="text-foreground">o quanto você age nela hoje</strong>.
          A distância entre as duas mostra se seus valores estão alinhados com suas prioridades e para onde sua energia está indo. No fim, sai um plano de ação para {nomeDoMes(d.mes)}.
        </p>
        <ol className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {etapas.map((e) => (
            <li key={e.id}>
              <a href={`#${e.id}`} className={cn("block rounded-lg border px-3 py-2 hover:border-input", e.n === "R" && "bg-accent/50")}>
                <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{e.n === "R" ? "Resultado" : `Passo ${e.n}`}</span>
                <span className="block text-sm font-medium">{e.titulo}</span>
                <span className="numeros block text-xs text-muted-foreground">{e.feito}</span>
              </a>
            </li>
          ))}
        </ol>
        {resumo.gapMedio !== null && resumoAnterior.gapMedio !== null && (
          <p className="numeros mt-3 text-sm">
            Distância média entre importância e ação: <strong>{resumo.gapMedio.toFixed(1).replace(".", ",")}</strong>
            {" "}(mês anterior: {resumoAnterior.gapMedio.toFixed(1).replace(".", ",")})
            {" "}{resumo.gapMedio < resumoAnterior.gapMedio ? <span className="text-feito">o gap diminuiu.</span> : resumo.gapMedio > resumoAnterior.gapMedio ? <span className="text-aviso">o gap aumentou.</span> : "igual ao mês anterior."}
          </p>
        )}
      </section>

      <Passo id="avaliacao" n="1" titulo="Avaliação" descricao="Arraste as duas notas de cada área. Responda pelo que acontece hoje, não pelo que você gostaria.">
        {podeCopiar && (
          <Button variant="outline" size="sm" className="mb-3" onClick={copiarAnterior}><Copy className="size-4" /> Começar pelas notas do mês anterior</Button>
        )}
        <ul className="grid gap-2 md:grid-cols-2">
          {areas.map((a) => {
            const n = nota(a.id);
            const g = gap(n);
            return (
              <li key={a.id} data-area={a.nome} className="rounded-lg border bg-background/40 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: g === null ? "var(--border)" : corDoGap(g) }} aria-hidden />
                  <h3 className="flex-1 truncate text-sm font-medium">{a.nome}</h3>
                  {g !== null && <span className="numeros text-xs text-muted-foreground">gap {sinal(g)}</span>}
                  <button type="button" aria-label={`Remover área ${a.nome}`} onClick={() => removerArea(a)} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent"><X className="size-3.5" /></button>
                </div>
                <div className="space-y-1.5">
                  <Regua rotulo="importância" valor={n.importancia} tom="forte" onChange={(v) => alterar(a.id, { importancia: v })} />
                  <Regua rotulo="ação" valor={n.acao} tom="suave" onChange={(v) => alterar(a.id, { acao: v })} />
                </div>
              </li>
            );
          })}
        </ul>
        <form onSubmit={adicionarArea} className="mt-3 flex max-w-sm gap-2">
          <Input value={novaArea} onChange={(e) => setNovaArea(e.target.value)} placeholder="Nova área (ex.: Saúde)" aria-label="Nova área" maxLength={60} className="h-9" />
          <Button type="submit" variant="outline" size="sm" className="h-9"><Plus className="size-4" /> Área</Button>
        </form>
      </Passo>

      <Passo id="plano" n="2" titulo="Valores e plano de ação" descricao="Comece pelas áreas com maior gap e pela que está recebendo energia demais. Para cada uma: qual valor está por trás e qual ação pequena, com dia e frequência, fecha o gap.">
        {plano.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">Avalie as áreas no passo 1 para aparecerem aqui as que pedem atenção.</p>
        ) : (
          <ul className="space-y-2">
            {[...plano, ...(verTodas ? outras : [])].map((l) => {
              const g = gap(l)!;
              const t = tipoGap(g)!;
              return (
                <li key={l.areaId} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[10rem_1fr_1fr]" style={{ background: `color-mix(in oklab, ${corDoGap(g)} 7%, transparent)` }}>
                  <div>
                    <p className="text-sm font-medium">{l.nome}</p>
                    <span className="numeros mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium" style={{ color: corDoGap(g), background: `color-mix(in oklab, ${corDoGap(g)} 16%, transparent)` }}>gap {sinal(g)} · {ROTULO_GAP[t]}</span>
                  </div>
                  <label className="space-y-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Valor por trás
                    <Textarea rows={2} defaultValue={l.valor ?? ""} placeholder="Ex.: leveza, tempo que não precisa render" className="text-sm font-normal tracking-normal normal-case"
                      onBlur={(e) => e.target.value !== (l.valor ?? "") && alterar(l.areaId, { valor: e.target.value.trim() || null }, 0)} />
                  </label>
                  <label className="space-y-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Eu me comprometo a
                    <Textarea rows={2} defaultValue={l.compromisso ?? ""} placeholder="Ex.: domingo à tarde sem tela, 1 hobby por semana na agenda" className="text-sm font-normal tracking-normal normal-case"
                      onBlur={(e) => e.target.value !== (l.compromisso ?? "") && alterar(l.areaId, { compromisso: e.target.value.trim() || null }, 0)} />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {outras.length > 0 && plano.length > 0 && (
          <button type="button" className="mt-2 text-xs text-muted-foreground underline underline-offset-2" onClick={() => setVerTodas((v) => !v)}>
            {verTodas ? "Esconder as outras áreas" : `+ ver as outras ${outras.length} áreas`}
          </button>
        )}
      </Passo>

      <Passo id="foco" n="3" titulo="Foco do mês" descricao="Escolha até 3 áreas para cuidar nos próximos 30 dias, defina até onde quer levar a nota de ação e como vai medir. Mais de 3 vira lista de desejos.">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Áreas em foco">
          {porGap(linhas).map((l) => (
            <button key={l.areaId} type="button" aria-pressed={!!l.foco} onClick={() => alternarFoco(l.areaId)}
              className={cn("numeros rounded-full border px-2.5 py-1 text-xs", l.foco ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent")}>
              {l.nome} {sinal(gap(l)!)}
            </button>
          ))}
          {avaliadas.length === 0 && <p className="text-sm text-muted-foreground">Avalie as áreas primeiro.</p>}
        </div>
        {focos.length > 0 && (
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {focos.map((f) => (
              <li key={f.areaId} className="rounded-lg border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{f.nome}</p>
                  <span className="numeros text-xs text-muted-foreground">importância {f.importancia ?? "–"}</span>
                </div>
                <p className="numeros mt-2 text-2xl font-semibold">{f.acao ?? "–"} <span className="text-muted-foreground">→</span> {f.meta_acao ?? "–"}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">nota de ação em 30 dias</span></p>
                <label className="mt-2 grid grid-cols-[3rem_1fr_1.5rem] items-center gap-2 text-xs text-muted-foreground">
                  meta
                  <input type="range" min={Math.max(1, f.acao ?? 1)} max={10} value={f.meta_acao ?? f.acao ?? 5} aria-label={`Meta de ação para ${f.nome}`}
                    onChange={(e) => alterar(f.areaId, { meta_acao: Number(e.target.value) })} style={{ accentColor: "var(--feito)" }} />
                  <span className="numeros text-right font-semibold text-foreground">{f.meta_acao ?? "–"}</span>
                </label>
                <label className="mt-2 block space-y-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Como vou medir
                  <Textarea rows={2} defaultValue={f.como_medir ?? ""} placeholder="Ex.: domingos livres no mês (meta: 3 de 4)" className="text-sm font-normal tracking-normal normal-case"
                    onBlur={(e) => e.target.value !== (f.como_medir ?? "") && alterar(f.areaId, { como_medir: e.target.value.trim() || null }, 0)} />
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block space-y-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            O que sai da agenda para caber isso
            <Textarea rows={2} value={mesInfo.o_que_sai} onChange={(e) => alterarMes({ o_que_sai: e.target.value })} placeholder="Ex.: 1h de tela por dia depois das 22h" className="text-sm font-normal tracking-normal normal-case" />
          </label>
          <label className="block space-y-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Dia do check-in
            <Textarea rows={2} value={mesInfo.checkin} onChange={(e) => alterarMes({ checkin: e.target.value })} placeholder="Ex.: último domingo do mês, refazendo o passo 1" className="text-sm font-normal tracking-normal normal-case" />
          </label>
        </div>
        {focos.length > 0 && (
          <Button size="sm" className="mt-3" onClick={criarMetas}><Target className="size-4" /> Levar o foco para as metas do mês</Button>
        )}
      </Passo>

      <Passo id="diagnostico" n="R" titulo="Diagnóstico do mês" descricao="Onde está o gap e por onde começar. O canto de cima à esquerda do mapa junta o que importa muito e recebe pouca ação: é por ali que você começa.">
        {avaliadas.length < 3 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">Avalie pelo menos 3 áreas no passo 1 para ver o diagnóstico.</p>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div><h3 className="mb-2 text-sm font-semibold">Onde está o gap</h3><GraficoGap itens={itensGrafico} /></div>
              <div><h3 className="mb-2 text-sm font-semibold">Mapa de prioridades</h3><MapaPrioridades itens={itensGrafico} /></div>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Plano de ação para o mês</h3>
              <p className="text-xs text-muted-foreground">O resumo para deixar à vista.</p>
              {focos.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Escolha as áreas em foco no passo 3.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="text-[11px] tracking-wide text-muted-foreground uppercase">
                      <tr><th className="py-2 pr-3 font-semibold">Área</th><th className="py-2 pr-3 font-semibold">Ação</th><th className="py-2 pr-3 font-semibold">Eu me comprometo a</th><th className="py-2 font-semibold">Como vou medir</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {focos.map((f) => (
                        <tr key={f.areaId} className="align-top">
                          <td className="py-2 pr-3 font-medium">{f.nome}</td>
                          <td className="numeros py-2 pr-3 whitespace-nowrap">{f.acao ?? "–"} → {f.meta_acao ?? "–"}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{f.compromisso || "—"}</td>
                          <td className="py-2 text-muted-foreground">{f.como_medir || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(mesInfo.o_que_sai || mesInfo.checkin) && (
                <div className="mt-3 space-y-2 rounded-lg bg-accent/60 p-3 text-sm">
                  {mesInfo.o_que_sai && <p><span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">O que sai da agenda</span>{mesInfo.o_que_sai}</p>}
                  {mesInfo.checkin && <p><span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Check-in</span>{mesInfo.checkin}</p>}
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">No mês seguinte, refaça o Raio-X e veja se o gap diminuiu.</p>
            </div>
          </div>
        )}
      </Passo>
    </div>
  );
}
