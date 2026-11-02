// Cronômetro único, guardado no aparelho (sobrevive a recarregar e a fechar a aba).
// Foco: contagem regressiva ligada a um hábito do dia. Freela: contagem progressiva que vira horas.
import { useSyncExternalStore } from "react";

const CHAVE = "cadeia:cronometro";
const EVENTO = "cadeia:cronometro";

export type Cronometro =
  | { tipo: "foco"; habitoId: string; cadeiaId: string | null; nome: string; data: string; inicio: number; fim: number; avisado?: boolean }
  | { tipo: "freela"; freelaId: string; nome: string; inicio: number };

let cache: { bruto: string | null; valor: Cronometro | null } = { bruto: null, valor: null };

function ler(): Cronometro | null {
  if (typeof localStorage === "undefined") return null;
  const bruto = localStorage.getItem(CHAVE);
  if (bruto !== cache.bruto) {
    try { cache = { bruto, valor: bruto ? JSON.parse(bruto) : null }; } catch { cache = { bruto, valor: null }; }
  }
  return cache.valor;
}

function gravar(c: Cronometro | null) {
  if (c) localStorage.setItem(CHAVE, JSON.stringify(c)); else localStorage.removeItem(CHAVE);
  window.dispatchEvent(new Event(EVENTO));
}

/** Minutos de foco a partir do mínimo do hábito ("25 minutos (1 pomodoro)" → 25); padrão 25. */
export function minutosDeFoco(minimo: string | null | undefined) {
  const m = minimo?.match(/(\d+)\s*min/i);
  const n = m ? Number(m[1]) : 25;
  return n >= 5 && n <= 180 ? n : 25;
}

export function iniciarFoco(a: { habitoId: string; cadeiaId: string | null; nome: string; data: string; minutos: number }) {
  const agora = Date.now();
  gravar({ tipo: "foco", ...a, inicio: agora, fim: agora + a.minutos * 60_000 });
}

export function iniciarFreela(freelaId: string, nome: string) {
  gravar({ tipo: "freela", freelaId, nome, inicio: Date.now() });
}

export function marcarAvisado() {
  const c = ler();
  if (c?.tipo === "foco") gravar({ ...c, avisado: true });
}

export const pararCronometro = () => gravar(null);

function assinar(cb: () => void) {
  const aoMudar = (e: Event) => { if (!(e instanceof StorageEvent) || e.key === CHAVE) cb(); };
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", aoMudar);
  return () => { window.removeEventListener(EVENTO, cb); window.removeEventListener("storage", aoMudar); };
}

export function useCronometro() {
  return useSyncExternalStore(assinar, ler, () => null);
}

export function formatarDuracao(ms: number) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const dd = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${dd(m)}:${dd(s)}` : `${dd(m)}:${dd(s)}`;
}
