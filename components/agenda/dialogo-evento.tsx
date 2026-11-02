"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Evento } from "@motor";
import type { DadosEvento } from "@/lib/mutacoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Tipo = DadosEvento["tipo"];
const TIPOS: { v: Tipo; r: string; d: string }[] = [
  { v: "compromisso", r: "Compromisso", d: "Reunião, consulta, encontro." },
  { v: "excecao_rotina", r: "Sem aula", d: "Tira os trajetos; os hábitos deles viram flexíveis." },
  { v: "prazo", r: "Prazo", d: "Entrega com data. Não conta como hábito." },
];

const lista = (s: string) => [...new Set(s.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 31))].sort((a, b) => a - b);

export function DialogoEvento({ evento, dataInicial, onFechar, onSalvar, onExcluir }: {
  evento: Evento | null; dataInicial: string; onFechar: () => void;
  onSalvar: (d: DadosEvento) => Promise<void>; onExcluir?: () => Promise<void>;
}) {
  const [tipo, setTipo] = useState<Tipo>(evento?.tipo ?? "compromisso");
  const [titulo, setTitulo] = useState(evento?.titulo ?? "");
  const [data, setData] = useState(evento?.data ?? dataInicial);
  const [inicio, setInicio] = useState(evento?.inicio ?? "");
  const [fim, setFim] = useState(evento?.fim ?? "");
  const [local, setLocal] = useState(evento?.local ?? "");
  const [mensal, setMensal] = useState(!!evento?.recorrencia);
  const [diaMes, setDiaMes] = useState(evento?.recorrencia?.split(":")[1] ?? String(Number(dataInicial.slice(8))));
  const [lembDias, setLembDias] = useState((evento?.lembretesDias ?? []).join(", "));
  const [lembAntes, setLembAntes] = useState((evento?.lembretesAntes ?? (evento ? [] : [1])).join(", "));
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const tituloFinal = titulo.trim() || (tipo === "excecao_rotina" ? "Sem aula" : "");
    if (!tituloFinal) { toast.error("Dê um título."); return; }
    if (tipo === "compromisso" && fim && inicio && fim <= inicio) { toast.error("O fim precisa ser depois do início."); return; }
    setOcupado(true);
    try {
      await onSalvar({
        tipo, titulo: tituloFinal, data: tipo === "prazo" && mensal ? null : data,
        inicio: inicio || null, fim: fim || null, local: local || null,
        recorrencia: tipo === "prazo" && mensal ? `mensal:${Number(diaMes)}` : null,
        lembretesDias: lista(lembDias), lembretesAntes: lista(lembAntes),
      });
      toast.success(evento ? "Evento salvo." : "Evento criado.");
      onFechar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{evento ? "Editar evento" : "Novo evento"}</DialogTitle>
          <DialogDescription>{TIPOS.find((t) => t.v === tipo)?.d}</DialogDescription>
        </DialogHeader>
        <form id="form-evento" onSubmit={enviar} className="space-y-4">
          {!evento && (
            <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
              {TIPOS.map((t) => (
                <button key={t.v} type="button" role="radio" aria-checked={tipo === t.v} onClick={() => setTipo(t.v)}
                  className={cn("h-8 rounded-md text-sm text-muted-foreground", tipo === t.v && "bg-card font-medium text-foreground shadow-sm")}>
                  {t.r}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="e-titulo" className="text-[13px]">Título</Label>
            <Input id="e-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus
              placeholder={tipo === "excecao_rotina" ? "Sem aula" : tipo === "prazo" ? "Ex.: Entregar relatório" : "Ex.: Reunião do grupo"} />
          </div>

          {tipo === "prazo" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mensal} onChange={(e) => setMensal(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              Repete todo mês
            </label>
          )}

          {tipo === "prazo" && mensal ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="e-diames" className="text-[13px]">Dia do mês</Label>
                <Input id="e-diames" type="number" min={1} max={28} required value={diaMes} onChange={(e) => setDiaMes(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-lembdias" className="text-[13px]">Lembrar nos dias</Label>
                <Input id="e-lembdias" value={lembDias} onChange={(e) => setLembDias(e.target.value)} placeholder="Ex.: 1, 9" />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="e-data" className="text-[13px]">Data</Label>
              <Input id="e-data" type="date" required value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          )}

          {tipo === "prazo" && !mensal && (
            <div className="space-y-1.5">
              <Label htmlFor="e-antes" className="text-[13px]">Lembrar quantos dias antes</Label>
              <Input id="e-antes" value={lembAntes} onChange={(e) => setLembAntes(e.target.value)} placeholder="Ex.: 1, 3" />
              <p className="text-xs text-muted-foreground">O lembrete sai na notificação das 8h. No dia do prazo também.</p>
            </div>
          )}

          {tipo === "compromisso" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="e-inicio" className="text-[13px]">Início</Label>
                  <Input id="e-inicio" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-fim" className="text-[13px]">Fim</Label>
                  <Input id="e-fim" type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">Sem fim = sem horário de término. Se o início cair na janela de uma cadeia, o Hoje avisa.</p>
              <div className="space-y-1.5">
                <Label htmlFor="e-local" className="text-[13px]">Local</Label>
                <Input id="e-local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Opcional" />
              </div>
            </>
          )}
        </form>
        <DialogFooter className="sm:justify-between">
          {evento && onExcluir ? (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={ocupado}
              onClick={async () => {
                if (!confirm(`Excluir "${evento.titulo}"?`)) return;
                setOcupado(true);
                try { await onExcluir(); toast.success("Evento excluído."); onFechar(); } catch (err) { toast.error((err as Error).message); } finally { setOcupado(false); }
              }}>
              Excluir
            </Button>
          ) : <span />}
          <Button type="submit" form="form-evento" disabled={ocupado}>{evento ? "Salvar" : "Criar evento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
