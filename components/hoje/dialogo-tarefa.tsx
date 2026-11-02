"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Tarefa } from "@/lib/dados";
import type { DadosRecorrencia, DadosTarefa } from "@/lib/mutacoes";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { linhaParaRecorrencia } from "@/lib/dados";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ResultadoTarefa =
  | { tipo: "tarefa"; dados: DadosTarefa }
  | { tipo: "recorrencia"; dados: DadosRecorrencia; id?: string };

type Repetir = "nao" | "diaria" | "semanal" | "mensal";
const DIAS = [{ d: 1, r: "Seg" }, { d: 2, r: "Ter" }, { d: 3, r: "Qua" }, { d: 4, r: "Qui" }, { d: 5, r: "Sex" }, { d: 6, r: "Sáb" }, { d: 0, r: "Dom" }];

export function DialogoTarefa({ tarefa, dataInicial, onFechar, onSalvar }: {
  tarefa: Tarefa | null; dataInicial: string; onFechar: () => void; onSalvar: (r: ResultadoTarefa) => Promise<void>;
}) {
  const recorrenteId = tarefa?.recorrenteId ?? null;
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? "");
  const [data, setData] = useState(tarefa?.data ?? dataInicial);
  const [hora, setHora] = useState(tarefa?.hora ?? "");
  const [notas, setNotas] = useState(tarefa?.notas ?? "");
  const [importante, setImportante] = useState(tarefa?.prioridade === 1);
  const [repetir, setRepetir] = useState<Repetir>("nao");
  const [dias, setDias] = useState<number[]>([new Date(`${dataInicial}T12:00:00Z`).getUTCDay()]);
  const [diaMes, setDiaMes] = useState(String(Number(dataInicial.slice(8))));
  const [carregando, setCarregando] = useState(!!recorrenteId);
  const [ocupado, setOcupado] = useState(false);

  // Editando uma tarefa recorrente: carrega a regra para editar a repetição inteira.
  useEffect(() => {
    if (!recorrenteId) return;
    criarClienteNavegador().from("tarefas_recorrentes").select("*").eq("id", recorrenteId).maybeSingle().then(({ data: r }) => {
      if (r) {
        const rec = linhaParaRecorrencia(r);
        setTitulo(rec.titulo); setHora(rec.hora ?? ""); setImportante(rec.prioridade === 1); setRepetir(rec.regra);
        if (rec.diasSemana.length) setDias(rec.diasSemana);
        if (rec.diaMes) setDiaMes(String(rec.diaMes));
      }
      setCarregando(false);
    });
  }, [recorrenteId]);

  const podeRepetir = !tarefa || !!recorrenteId;
  const alternarDia = (d: number) => setDias((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]));

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{recorrenteId ? "Editar repetição" : tarefa ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          <DialogDescription>
            {repetir === "nao"
              ? "Coisas avulsas do dia. Não contam como hábito; se ficarem para trás, aparecem nos dias seguintes até você concluir."
              : "Aparece sozinha em cada dia da regra. Se não concluir, não acumula: no dia seguinte vale a nova."}
          </DialogDescription>
        </DialogHeader>
        <form id="form-tarefa" className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          if (repetir === "semanal" && !dias.length) { toast.error("Escolha pelo menos um dia."); return; }
          setOcupado(true);
          try {
            const prioridade = importante ? 1 : 0;
            await onSalvar(repetir === "nao"
              ? { tipo: "tarefa", dados: { titulo, data, hora: hora || null, notas: notas || null, prioridade } }
              : { tipo: "recorrencia", id: recorrenteId ?? undefined, dados: { titulo, regra: repetir, diasSemana: dias, diaMes: Number(diaMes), hora: hora || null, prioridade, inicio: data } });
            if (repetir !== "nao") toast.success(recorrenteId ? "Repetição salva." : "Tarefa recorrente criada.");
            onFechar();
          } catch (err) { toast.error((err as Error).message); } finally { setOcupado(false); }
        }}>
          <div className="space-y-1.5"><Label htmlFor="t-titulo" className="text-[13px]">Tarefa</Label><Input id="t-titulo" required value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Recarregar o Bilhete Único" autoFocus disabled={carregando} /></div>

          {podeRepetir && (
            <div className="space-y-1.5">
              <Label className="text-[13px]">Repetir</Label>
              <div role="radiogroup" aria-label="Repetir" className="grid grid-cols-4 gap-1 rounded-lg bg-secondary p-1">
                {([["nao", "Não"], ["diaria", "Todo dia"], ["semanal", "Semanal"], ["mensal", "Mensal"]] as const).map(([v, r]) => (
                  <button key={v} type="button" role="radio" aria-checked={repetir === v} onClick={() => setRepetir(v)}
                    disabled={!!recorrenteId && v === "nao"}
                    className={cn("h-8 rounded-md text-sm text-muted-foreground disabled:opacity-40", repetir === v && "bg-card font-medium text-foreground shadow-sm")}>{r}</button>
                ))}
              </div>
            </div>
          )}
          {repetir === "semanal" && (
            <div className="flex flex-wrap gap-1.5" aria-label="Dias da semana">
              {DIAS.map(({ d, r }) => (
                <button key={d} type="button" aria-pressed={dias.includes(d)} onClick={() => alternarDia(d)}
                  className={cn("h-8 w-11 rounded-md border text-sm", dias.includes(d) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>{r}</button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {repetir === "nao" && <div className="space-y-1.5"><Label htmlFor="t-data" className="text-[13px]">Dia</Label><Input id="t-data" type="date" required value={data} onChange={(e) => setData(e.target.value)} /></div>}
            {repetir === "mensal" && <div className="space-y-1.5"><Label htmlFor="t-diames" className="text-[13px]">Dia do mês</Label><Input id="t-diames" type="number" min={1} max={31} required value={diaMes} onChange={(e) => setDiaMes(e.target.value)} /></div>}
            {(repetir === "diaria" || repetir === "semanal") && !recorrenteId && <div className="space-y-1.5"><Label htmlFor="t-inicio" className="text-[13px]">A partir de</Label><Input id="t-inicio" type="date" required value={data} onChange={(e) => setData(e.target.value)} /></div>}
            <div className="space-y-1.5"><Label htmlFor="t-hora" className="text-[13px]">Horário</Label><Input id="t-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></div>
          </div>
          {repetir === "nao" && <div className="space-y-1.5"><Label htmlFor="t-notas" className="text-[13px]">Notas</Label><Textarea id="t-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" /></div>}
          <label className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm">
            <span className="font-medium">Importante</span>
            <Switch checked={importante} onCheckedChange={setImportante} />
          </label>
        </form>
        <DialogFooter><Button type="submit" form="form-tarefa" disabled={ocupado || carregando}>{tarefa ? "Salvar" : "Adicionar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
