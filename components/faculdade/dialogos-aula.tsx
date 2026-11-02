"use client";

import { useState } from "react";
import { toast } from "sonner";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { marcarSemAula, registrarFalta } from "@/lib/mutacoes";
import { diasDoPeriodo, disciplinasDoDia, LIMITE_DIAS_SEM_AULA, MOTIVOS_SEM_AULA, type AulaDaGrade } from "@/lib/faltas";
import { diaMes } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Dia (ou período) sem aula por qualquer motivo. */
export function DialogoSemAula({ dataInicial, aulas, onFechar, onFeito }: { dataInicial: string; aulas: AulaDaGrade[]; onFechar: () => void; onFeito: () => void }) {
  const sb = criarClienteNavegador();
  const [data, setData] = useState(dataInicial);
  const [ate, setAte] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const periodo = ate && ate !== data;
  const dias = periodo ? diasDoPeriodo(data, ate, aulas) : [data];
  const erroPeriodo = periodo && !dias.length ? (ate < data ? "O fim vem antes do início." : `Escolha até ${LIMITE_DIAS_SEM_AULA} dias, com pelo menos um dia de aula.`) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dia sem aula</DialogTitle>
          <DialogDescription>A aula some do dia e a rotina vira a de dia sem aula: os trajetos saem e os hábitos deles viram flexíveis.</DialogDescription>
        </DialogHeader>
        <form id="form-sem-aula" className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          if (erroPeriodo || !dias.length) return;
          setOcupado(true);
          try {
            await marcarSemAula(sb, dias, motivo);
            toast.success(dias.length === 1 ? `${diaMes(dias[0])} marcado como sem aula.` : `${dias.length} dias marcados como sem aula.`);
            onFeito();
            onFechar();
          } catch (erro) {
            toast.error((erro as Error).message);
          } finally {
            setOcupado(false);
          }
        }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="sa-data" className="text-[13px]">Dia</Label><Input id="sa-data" type="date" required value={data} onChange={(e) => setData(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="sa-ate" className="text-[13px]">Até (opcional)</Label><Input id="sa-ate" type="date" min={data} value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sa-motivo" className="text-[13px]">Motivo</Label>
            <Input id="sa-motivo" maxLength={120} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Escreva o motivo, se quiser" />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {MOTIVOS_SEM_AULA.map((m) => (
                <button key={m} type="button" onClick={() => setMotivo(m)}
                  className={cn("rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground", motivo === m && "border-ring/50 bg-accent text-foreground")}>{m}</button>
              ))}
            </div>
          </div>
          {periodo && (erroPeriodo
            ? <p className="text-sm text-destructive">{erroPeriodo}</p>
            : <p className="text-sm text-muted-foreground">{dias.length} {dias.length === 1 ? "dia de aula" : "dias de aula"} no período: {dias.slice(0, 6).map(diaMes).join(", ")}{dias.length > 6 ? "…" : ""}</p>)}
        </form>
        <DialogFooter><Button type="submit" form="form-sem-aula" disabled={ocupado || !!erroPeriodo}>Marcar sem aula</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Falta em uma ou mais aulas do dia. */
export function DialogoFalta({ dataInicial, hoje, aulas, disciplinas, onFechar, onFeito }: {
  dataInicial: string; hoje: string; aulas: AulaDaGrade[]; disciplinas: { id: string; nome: string }[]; onFechar: () => void; onFeito: () => void;
}) {
  const sb = criarClienteNavegador();
  const [data, setData] = useState(dataInicial > hoje ? hoje : dataInicial);
  const doDia = disciplinasDoDia(aulas, data);
  // Sem aula na grade nesse dia (ex.: reposição), dá para escolher qualquer disciplina do semestre.
  const opcoes = doDia.length ? doDia : disciplinas;
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(disciplinasDoDia(aulas, dataInicial > hoje ? hoje : dataInicial).map((d) => d.id)));
  const [motivo, setMotivo] = useState("");
  const [naoFui, setNaoFui] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const trocarData = (d: string) => { setData(d); setMarcadas(new Set(disciplinasDoDia(aulas, d).map((x) => x.id))); };
  const alternar = (id: string) => setMarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar falta</DialogTitle>
          <DialogDescription>Fica registrado na disciplina, com a contagem de faltas na página Faculdade.</DialogDescription>
        </DialogHeader>
        <form id="form-falta" className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const escolhidas = opcoes.filter((o) => marcadas.has(o.id)).map((o) => o.id);
          if (!escolhidas.length) { toast.error("Escolha a disciplina em que você faltou."); return; }
          setOcupado(true);
          try {
            await registrarFalta(sb, { data, disciplinaIds: escolhidas, motivo: motivo || null, naoFui });
            toast.success(escolhidas.length === 1 ? "Falta registrada." : `${escolhidas.length} faltas registradas.`);
            onFeito();
            onFechar();
          } catch (erro) {
            toast.error((erro as Error).message);
          } finally {
            setOcupado(false);
          }
        }}>
          <div className="space-y-1.5"><Label htmlFor="f-data" className="text-[13px]">Dia</Label><Input id="f-data" type="date" required max={hoje} value={data} onChange={(e) => trocarData(e.target.value)} /></div>
          <fieldset className="space-y-1.5">
            <legend className="text-[13px] font-medium">{doDia.length ? "Aulas do dia" : "Nenhuma aula na grade nesse dia. Escolha a disciplina:"}</legend>
            {opcoes.length === 0 ? <p className="text-sm text-muted-foreground">Cadastre as disciplinas do semestre primeiro.</p> : (
              <div className="grid gap-1.5 pt-1">
                {opcoes.map((d) => (
                  <label key={d.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-ring/50 has-[:checked]:bg-accent/50">
                    <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={marcadas.has(d.id)} onChange={() => alternar(d.id)} />
                    {d.nome}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="space-y-1.5"><Label htmlFor="f-motivo" className="text-[13px]">Motivo (opcional)</Label><Input id="f-motivo" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: médico, trabalho, trânsito" /></div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={naoFui} onChange={(e) => setNaoFui(e.target.checked)} />
            <span>Não fui para a faculdade<span className="block text-xs text-muted-foreground">A rotina do dia vira a de dia sem aula (os trajetos saem). Desmarque se você foi e só perdeu parte da aula.</span></span>
          </label>
        </form>
        <DialogFooter><Button type="submit" form="form-falta" disabled={ocupado || opcoes.length === 0}>Registrar falta</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
