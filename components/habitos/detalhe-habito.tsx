"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { adicionarFlexivel, adicionarPasso, arquivarHabito, moverPasso, removerFlexivel, removerPasso, renomearHabito, type ContextoFlex } from "@/lib/mutacoes";
import { horaCurta } from "@motor";
import type { ContextoCompleto } from "@/lib/dados";
import { MapaCalor, Legenda } from "./mapa-calor";
import type { LinhaProgresso } from "./aba-progresso";
import type { NotaHabito } from "./tela-habitos";
import { diaMes } from "@/lib/apresentacao";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function DetalheHabito({ linha, notas, hoje, inicio, ctx, onFechar }: { linha: LinhaProgresso | null; notas: NotaHabito[]; hoje: string; inicio: string; ctx: ContextoCompleto; onFechar: () => void }) {
  return (
    <Sheet open={!!linha} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {linha && <Conteudo key={linha.id} linha={linha} notas={notas} hoje={hoje} inicio={inicio} ctx={ctx} onFechar={onFechar} />}
      </SheetContent>
    </Sheet>
  );
}

function Conteudo({ linha, notas, hoje, inicio, ctx, onFechar }: { linha: LinhaProgresso; notas: NotaHabito[]; hoje: string; inicio: string; ctx: ContextoCompleto; onFechar: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState(linha.nome);
  const [ocupado, setOcupado] = useState(false);
  const r = linha.resumo;
  const sb = criarClienteNavegador();
  // Onde o hábito aparece: em quais cadeias (com o passo) e em quais tipos de dia como flexível.
  const presencas = ctx.cadeias.flatMap((c) => c.passos.filter((p) => p.habitoId === linha.id).map((p) => ({ cadeia: c, passo: p })));
  const outras = ctx.cadeias.filter((c) => !c.passos.some((p) => p.habitoId === linha.id));
  const flexEm = (contexto: ContextoFlex) => ctx.regrasFlex.some((f) => f.contexto === contexto && f.habitoIds.includes(linha.id));
  const janela = (c: (typeof ctx.cadeias)[number]) => (c.janelaInicio && c.janelaFim ? ` · ${horaCurta(c.janelaInicio)}–${horaCurta(c.janelaFim)}` : "");

  async function agir(f: () => Promise<void>, ok: string) {
    setOcupado(true);
    try { await f(); toast.success(ok); router.refresh(); } catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-lg">{linha.nome}</SheetTitle>
        <SheetDescription className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full" style={{ background: linha.cor }} aria-hidden />{linha.onde}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-6 px-4 pb-6">
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-center">
          {[
            ["Adesão", pct(r.adesao)],
            ["Sequência", String(r.sequenciaAtual)],
            ["Melhor", String(r.melhorSequencia)],
            ["Feito", String(r.completos)],
            ["Mínimo", String(r.minimos)],
            ["Não feito", String(r.naoFeitos)],
          ].map(([k, v]) => (
            <div key={k} className="bg-card px-2 py-3">
              <dt className="text-[11px] text-muted-foreground">{k}</dt>
              <dd className="numeros mt-1 text-lg font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Adesão = (feito + mínimo) ÷ dias em que o hábito valia. &quot;Não se aplica&quot; e dias em que você não registrou nada ficam fora da conta.
          {r.diasQueValeram === 0 && " Ainda não há dias suficientes para calcular."}
        </p>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">Histórico</h3>
          <div className="overflow-x-auto"><MapaCalor linha={linha.linha} hoje={hoje} inicio={inicio} maxSemanas={20} tamanho="lg" /></div>
          <Legenda />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Rumo aos 66 dias</h3>
          <div className="relative h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <span className="absolute inset-y-0 left-0 rounded-full bg-feito" style={{ width: `${Math.min(100, (r.diasPraticados / 66) * 100)}%` }} />
          </div>
          <p className="numeros text-xs text-muted-foreground">
            {r.diasPraticados} de 66 dias praticados. A mediana para um hábito ficar automático é 66 dias, mas varia de 18 a 254 (Lally et al., 2010).
          </p>
        </section>

        {notas.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Notas</h3>
            <ul className="space-y-2">
              {notas.slice(0, 20).map((n) => (
                <li key={n.data} className="rounded-lg border px-3 py-2 text-sm">
                  <span className="numeros text-xs text-muted-foreground">{diaMes(n.data)}, {n.status === "completo" ? "feito" : n.status === "minimo" ? "mínimo" : n.status === "nao_feito" ? "não feito" : "não se aplica"}</span>
                  <p className="mt-0.5">{n.nota}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="t-onde" className="space-y-2">
          <h3 id="t-onde" className="text-sm font-medium">Onde aparece</h3>
          <p className="text-xs text-muted-foreground">Em qual bloco (cadeia) do dia o hábito entra. Mover mantém gatilho, mínimo e o histórico.</p>
          {presencas.length === 0 && <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">Em nenhuma cadeia.</p>}
          <ul className="space-y-1.5">
            {presencas.map(({ cadeia, passo }) => (
              <li key={passo.id} className="space-y-2 rounded-lg border px-3 py-2 text-sm">
                <p><span className="font-medium">{cadeia.nome}</span><span className="numeros text-xs text-muted-foreground">{janela(cadeia)}</span></p>
                <div className="flex items-center gap-2">
                {outras.length > 0 && (
                  <select aria-label={`Mover ${linha.nome} de ${cadeia.nome} para outra cadeia`} value="" disabled={ocupado}
                    className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-xs text-muted-foreground"
                    onChange={(e) => {
                      const destino = outras.find((c) => c.id === e.target.value);
                      if (destino) agir(() => moverPasso(sb, passo.id, cadeia.id, destino.id, cadeia.passos.filter((x) => x.id !== passo.id).map((x) => x.id)), `Movido para ${destino.nome}.`);
                    }}>
                    <option value="">Mover para…</option>
                    {outras.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                )}
                <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" disabled={ocupado}
                  onClick={() => confirm(`Tirar ${linha.nome} da cadeia ${cadeia.nome}?`) && agir(() => removerPasso(sb, cadeia.id, passo.id, cadeia.passos.filter((x) => x.id !== passo.id).map((x) => x.id)), "Tirado da cadeia.")}>
                  Tirar
                </Button>
                </div>
              </li>
            ))}
          </ul>
          {outras.length > 0 && (
            <select aria-label={`Colocar ${linha.nome} também em outra cadeia`} value="" disabled={ocupado}
              className="h-8 rounded-md border bg-transparent px-2 text-sm text-muted-foreground"
              onChange={(e) => {
                const destino = outras.find((c) => c.id === e.target.value);
                const base = presencas[0]?.passo;
                if (destino) agir(() => adicionarPasso(sb, destino.id, { habitoId: linha.id, gatilho: base?.gatilho ?? "a definir", minimo: base?.minimo ?? null, completo: base?.completo ?? null, naoAntes: null }), `Adicionado em ${destino.nome}. Ajuste o gatilho na aba Cadeias.`);
              }}>
              <option value="">+ Colocar também em…</option>
              {outras.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
            {([["dia_util_sem_aula", "Flexível em dia útil sem aula"], ["fim_de_semana", "Flexível no fim de semana"]] as const).map(([contexto, rotulo]) => (
              <label key={contexto} className="flex items-center gap-2">
                <input type="checkbox" className="size-4" checked={flexEm(contexto)} disabled={ocupado}
                  onChange={(e) => agir(() => (e.target.checked ? adicionarFlexivel(sb, contexto, linha.id) : removerFlexivel(sb, contexto, linha.id)), "Salvo.")} />
                {rotulo}
              </label>
            ))}
          </div>
        </section>

        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); agir(() => renomearHabito(criarClienteNavegador(), linha.id, nome), "Nome salvo."); }}>
          <Label htmlFor="d-nome" className="text-[13px]">Nome</Label>
          <div className="flex gap-2">
            <Input id="d-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
            <Button type="submit" variant="secondary" disabled={ocupado || nome.trim() === linha.nome}>Salvar</Button>
          </div>
        </form>

        <Button variant="ghost" className="w-full justify-start text-muted-foreground" disabled={ocupado}
          onClick={() => {
            if (!confirm(`Arquivar "${linha.nome}"? Ele sai do Hoje e das cadeias, mas o histórico fica guardado.`)) return;
            agir(async () => { await arquivarHabito(criarClienteNavegador(), linha.id); onFechar(); }, "Hábito arquivado.");
          }}>
          <Archive className="size-4" /> Arquivar hábito
        </Button>
      </div>
    </>
  );
}
