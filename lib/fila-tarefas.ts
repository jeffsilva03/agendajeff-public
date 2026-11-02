// Fila offline de tarefas (mesma ideia da fila de checks). As tarefas criadas sem sinal já
// recebem um id gerado no aparelho, para que concluir/editar/excluir antes de enviar funcione.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tarefa } from "@/lib/dados";
import { ehErroDeRede, EVENTO_FILA } from "./fila-offline";

const CHAVE = "cadeia:fila-tarefas";

/** UUID v4. getRandomValues funciona mesmo fora de HTTPS (ex.: celular pela rede local). */
export function novoId(): string {
  if (typeof crypto.randomUUID === "function" && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type AcaoTarefa =
  | { acao: "criar"; id: string; linha: { titulo: string; data: string; hora: string | null; notas: string | null; prioridade: number; recorrente_id?: string | null; concluida_em?: string | null }; em: string }
  | { acao: "atualizar"; id: string; campos: Record<string, unknown>; em: string }
  | { acao: "excluir"; id: string; em: string };

export function lerFilaTarefas(): AcaoTarefa[] {
  if (typeof localStorage === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CHAVE) ?? "[]"); } catch { return []; }
}

function gravar(fila: AcaoTarefa[]) {
  localStorage.setItem(CHAVE, JSON.stringify(fila));
  window.dispatchEvent(new Event(EVENTO_FILA));
}

export function enfileirarTarefa(a: AcaoTarefa) {
  const fila = lerFilaTarefas();
  // Excluir algo que ainda nem subiu: basta apagar da fila.
  if (a.acao === "excluir" && fila.some((x) => x.acao === "criar" && x.id === a.id)) {
    gravar(fila.filter((x) => x.id !== a.id));
    return;
  }
  gravar([...fila, a]);
}

/** Aplica a fila sobre a lista carregada do servidor (ou do cache), para a data mostrada. */
export function aplicarFilaTarefas(lista: Tarefa[], data: string): Tarefa[] {
  let l = [...lista];
  for (const a of lerFilaTarefas()) {
    if (a.acao === "criar") {
      if (a.linha.data !== data || l.some((t) => t.id === a.id)) continue;
      l = l.filter((t) => !(t.virtual && t.recorrenteId && t.recorrenteId === a.linha.recorrente_id));
      l.push({ id: a.id, titulo: a.linha.titulo, data: a.linha.data, hora: a.linha.hora, notas: a.linha.notas, prioridade: a.linha.prioridade, concluidaEm: a.linha.concluida_em ?? null, recorrenteId: a.linha.recorrente_id ?? null });
    } else if (a.acao === "excluir") {
      l = l.filter((t) => t.id !== a.id);
    } else {
      l = l.map((t) => (t.id === a.id ? {
        ...t,
        ...("titulo" in a.campos ? { titulo: a.campos.titulo as string } : {}),
        ...("concluida_em" in a.campos ? { concluidaEm: a.campos.concluida_em as string | null } : {}),
        ...("data" in a.campos ? { data: a.campos.data as string } : {}),
        ...("hora" in a.campos ? { hora: a.campos.hora as string | null } : {}),
        ...("prioridade" in a.campos ? { prioridade: a.campos.prioridade as number } : {}),
        ...("notas" in a.campos ? { notas: a.campos.notas as string | null } : {}),
      } : t)).filter((t) => t.data === data || (t.data < data && !t.concluidaEm));
    }
  }
  return l;
}

export async function executarAcaoTarefa(sb: SupabaseClient, a: AcaoTarefa) {
  if (a.acao === "criar") return sb.from("tarefas").insert({ id: a.id, ...a.linha });
  if (a.acao === "excluir") return sb.from("tarefas").delete().eq("id", a.id);
  return sb.from("tarefas").update(a.campos).eq("id", a.id);
}

/** Tenta agora; sem rede, guarda na fila. Retorna "ok", "fila" ou lança o erro do servidor. */
export async function fazerOuEnfileirar(sb: SupabaseClient, a: AcaoTarefa): Promise<"ok" | "fila"> {
  if (typeof navigator !== "undefined" && !navigator.onLine) { enfileirarTarefa(a); return "fila"; }
  const { error } = await executarAcaoTarefa(sb, a);
  if (error && ehErroDeRede(error)) { enfileirarTarefa(a); return "fila"; }
  if (error) throw new Error(error.message);
  return "ok";
}

let enviando = false;
export async function enviarFilaTarefas(sb: SupabaseClient) {
  if (enviando) return { enviados: 0, recusados: 0 };
  enviando = true;
  let enviados = 0, recusados = 0;
  try {
    for (const a of lerFilaTarefas()) {
      const { error } = await executarAcaoTarefa(sb, a);
      if (error && ehErroDeRede(error)) break;
      if (error) recusados++; else enviados++;
      gravar(lerFilaTarefas().filter((x) => !(x.id === a.id && x.em === a.em && x.acao === a.acao)));
    }
  } finally {
    enviando = false;
  }
  return { enviados, recusados };
}
