"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Square, Timer, Briefcase } from "lucide-react";
import { agoraSP } from "@motor";
import { formatarDuracao, marcarAvisado, pararCronometro, useCronometro } from "@/lib/cronometro";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { ehErroDeRede, enfileirar, gravarCheck } from "@/lib/fila-offline";
import { registrarFoco, registrarHoras } from "@/lib/mutacoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HalfCircle } from "@/components/hoje/icones";
import { cn } from "@/lib/utils";

/** Pílula flutuante com o cronômetro ativo (foco de hábito ou horas de freela). */
export function CronometroFlutuante() {
  const c = useCronometro();
  const router = useRouter();
  const [agora, setAgora] = useState(() => Date.now());
  const [registrando, setRegistrando] = useState<{ horas: string; nota: string } | null>(null);

  useEffect(() => {
    if (!c) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [c]);

  const acabou = c?.tipo === "foco" && agora >= c.fim;

  // Fim do foco: notificação do sistema (se permitida) e vibração, uma vez só.
  useEffect(() => {
    if (!c || c.tipo !== "foco" || !acabou || c.avisado) return;
    marcarAvisado();
    // Sessão concluída entra no histórico de foco (Insights). Sem rede, a sessão não é registrada.
    registrarFoco(criarClienteNavegador(), c.habitoId, c.data, (c.fim - c.inicio) / 60_000).catch(() => {});
    navigator.vibrate?.([120, 80, 120]);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      navigator.serviceWorker?.getRegistration().then((r) =>
        r?.showNotification("Foco concluído", { body: `${c.nome}: marque como feito no Cadeia.`, icon: "/icons/icon-192.png", tag: "cadeia-foco", data: { url: "/hoje" } }));
    }
  }, [c, acabou]);

  if (!c) return null;

  async function marcarFoco(status: "completo" | "minimo") {
    if (!c || c.tipo !== "foco") return;
    const sb = criarClienteNavegador();
    const acao = { habitoId: c.habitoId, cadeiaId: c.cadeiaId, data: c.data, status, em: new Date().toISOString() };
    const { error } = navigator.onLine ? await gravarCheck(sb, acao) : { error: { message: "offline" } };
    if (error && ehErroDeRede(error)) enfileirar(acao);
    else if (error) { toast.error("Não foi possível marcar. Tente pelo Hoje."); return; }
    toast.success(`${c.nome}: ${status === "completo" ? "feito" : "mínimo"}.`);
    pararCronometro();
    router.refresh();
  }

  const decorrido = agora - c.inicio;
  const restante = c.tipo === "foco" ? c.fim - agora : 0;
  const progresso = c.tipo === "foco" ? Math.min(1, decorrido / (c.fim - c.inicio)) : 0;

  return (
    <>
      <div role="status" aria-live="polite"
        className={cn("fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border bg-popover/95 py-1.5 pr-1.5 pl-3 shadow-xl backdrop-blur md:right-6 md:bottom-6",
          acabou && "border-feito/50")}>
        {c.tipo === "foco" ? (
          <span className="relative grid size-7 place-items-center" aria-hidden>
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--secondary)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15" fill="none" stroke={acabou ? "var(--feito)" : "var(--tag-tarde)"} strokeWidth="3"
                strokeDasharray={`${progresso * 94.25} 94.25`} strokeLinecap="round" />
            </svg>
            <Timer className="size-3.5" />
          </span>
        ) : <Briefcase className="size-4 text-muted-foreground" aria-hidden />}
        <span className="min-w-0 text-sm">
          <span className="block max-w-40 truncate text-xs text-muted-foreground">{c.tipo === "foco" ? (acabou ? "Foco concluído" : "Foco") : "Freela"}: {c.nome}</span>
          <span className="numeros font-semibold">{c.tipo === "foco" ? (acabou ? "00:00" : formatarDuracao(restante)) : formatarDuracao(decorrido)}</span>
        </span>
        {c.tipo === "foco" && acabou ? (
          <span className="flex gap-1">
            <Button size="sm" className="h-8 rounded-full bg-feito text-white hover:bg-feito/90" onClick={() => marcarFoco("completo")}><Check className="size-4" /> Feito</Button>
            <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => marcarFoco("minimo")}><HalfCircle className="size-4" /> Mín.</Button>
          </span>
        ) : c.tipo === "freela" ? (
          <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() =>
            setRegistrando({ horas: (Math.max(0.01, decorrido / 3_600_000)).toFixed(2).replace(".", ","), nota: "" })}>
            <Square className="size-3.5" /> Parar
          </Button>
        ) : null}
        <Button size="icon" variant="ghost" className="size-8 rounded-full text-muted-foreground" aria-label="Descartar cronômetro"
          onClick={() => { if (c.tipo === "freela" && decorrido > 60_000 && !confirm("Descartar o tempo sem registrar?")) return; pararCronometro(); }}>
          ×
        </Button>
      </div>

      {registrando && c.tipo === "freela" && (
        <Dialog open onOpenChange={(o) => !o && setRegistrando(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Registrar horas</DialogTitle>
              <DialogDescription>{c.nome}, hoje.</DialogDescription>
            </DialogHeader>
            <form id="form-cron" className="space-y-3" onSubmit={async (e) => {
              e.preventDefault();
              const h = Number(registrando.horas.replace(",", "."));
              if (!(h > 0)) { toast.error("Horas inválidas."); return; }
              try {
                await registrarHoras(criarClienteNavegador(), c.freelaId, agoraSP().data, Math.round(h * 100) / 100, registrando.nota);
                toast.success("Horas registradas.");
                pararCronometro(); setRegistrando(null); router.refresh();
              } catch (err) { toast.error((err as Error).message); }
            }}>
              <div className="space-y-1.5">
                <Label htmlFor="cron-horas" className="text-[13px]">Horas</Label>
                <Input id="cron-horas" inputMode="decimal" value={registrando.horas} onChange={(e) => setRegistrando({ ...registrando, horas: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cron-nota" className="text-[13px]">O que foi feito</Label>
                <Input id="cron-nota" value={registrando.nota} onChange={(e) => setRegistrando({ ...registrando, nota: e.target.value })} placeholder="Opcional" autoFocus />
              </div>
            </form>
            <DialogFooter><Button type="submit" form="form-cron">Registrar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
