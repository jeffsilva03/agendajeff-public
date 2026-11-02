// Fila de checks feitos sem conexão (trem/metrô). Guardada no aparelho e enviada quando o sinal volta.
// A fila é compactada por hábito+dia: só a última ação vale (o servidor não precisa ver as intermediárias).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StatusCheck } from "@motor";

const CHAVE = "cadeia:fila-checks";
export const EVENTO_FILA = "cadeia:fila";

export interface AcaoCheck {
  habitoId: string;
  cadeiaId: string | null;
  data: string;
  status: StatusCheck | null; // null = desfazer
  nota?: string | null;
  em: string; // ISO do momento da ação
}

export function lerFila(): AcaoCheck[] {
  if (typeof localStorage === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CHAVE) ?? "[]"); } catch { return []; }
}

function gravar(fila: AcaoCheck[]) {
  localStorage.setItem(CHAVE, JSON.stringify(fila));
  window.dispatchEvent(new Event(EVENTO_FILA));
}

export function enfileirar(acao: AcaoCheck) {
  gravar([...lerFila().filter((a) => !(a.habitoId === acao.habitoId && a.data === acao.data)), acao]);
}

/** Erro de rede (sem sinal), em oposição a erro do servidor. */
export const ehErroDeRede = (e: { message?: string } | null | undefined) =>
  (typeof navigator !== "undefined" && !navigator.onLine) || /fetch|network|Load failed|NetworkError/i.test(e?.message ?? "");

export async function gravarCheck(sb: SupabaseClient, a: AcaoCheck) {
  return a.status
    ? sb.from("checks").upsert(
        { habit_id: a.habitoId, chain_id: a.cadeiaId, data_local: a.data, status: a.status, registrado_em: a.em, ...(a.nota !== undefined ? { nota: a.nota } : {}) },
        { onConflict: "user_id,habit_id,data_local" })
    : sb.from("checks").delete().eq("habit_id", a.habitoId).eq("data_local", a.data);
}

let enviando = false;
/** Envia a fila em ordem. Para no primeiro erro de rede; descarta ações que o servidor recusar. */
export async function enviarFila(sb: SupabaseClient): Promise<{ enviados: number; restantes: number; recusados: number }> {
  if (enviando) return { enviados: 0, restantes: lerFila().length, recusados: 0 };
  enviando = true;
  let enviados = 0, recusados = 0;
  try {
    for (const a of lerFila()) {
      const { error } = await gravarCheck(sb, a);
      if (error && ehErroDeRede(error)) break;
      if (error) recusados++; else enviados++;
      gravar(lerFila().filter((x) => !(x.habitoId === a.habitoId && x.data === a.data && x.em === a.em)));
    }
  } finally {
    enviando = false;
  }
  return { enviados, restantes: lerFila().length, recusados };
}
