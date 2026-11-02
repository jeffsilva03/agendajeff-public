import { diasEntre, somarDias } from "./datas.ts";
import type { Evento, OcorrenciaPrazo } from "./tipos.ts";

const pad = (n: number) => String(n).padStart(2, "0");

/** Datas de prazo de um evento entre `de` e `ate` (inclusive). */
function datasDoPrazo(e: Evento, de: string, ate: string): string[] {
  const m = e.recorrencia?.match(/^mensal:(\d{1,2})$/);
  // Prazo único: considera também os que vencem logo depois de `ate`, por causa dos lembretes antecipados.
  const folga = Math.max(0, ...(e.lembretesAntes ?? []));
  if (!m) return e.data && e.data >= de && e.data <= somarDias(ate, folga) ? [e.data] : [];
  const dia = Number(m[1]);
  const out: string[] = [];
  // Lembretes caem no mesmo mês do prazo, então basta percorrer os meses de `de` a `ate`.
  let [y, mo] = de.slice(0, 7).split("-").map(Number);
  const [yFim, moFim] = ate.slice(0, 7).split("-").map(Number);
  while (y < yFim || (y === yFim && mo <= moFim)) {
    out.push(`${y}-${pad(mo)}-${pad(dia)}`);
    mo++;
    if (mo > 12) { mo = 1; y++; }
  }
  return out;
}

/** Prazos e lembretes de prazo entre `de` e `ate`, ordenados por data. */
export function ocorrenciasDePrazos(eventos: Evento[], de: string, ate: string): OcorrenciaPrazo[] {
  const out: OcorrenciaPrazo[] = [];
  for (const e of eventos.filter((x) => x.tipo === "prazo")) {
    for (const dataPrazo of datasDoPrazo(e, de, ate)) {
      const ciclo = dataPrazo.slice(0, 8);
      const itens: OcorrenciaPrazo[] = e.recorrencia
        ? e.lembretesDias.map((d) => ({
            eventoId: e.id, titulo: e.titulo, data: `${ciclo}${String(d).padStart(2, "0")}`, tipo: "lembrete" as const, dataPrazo,
          }))
        : (e.lembretesAntes ?? []).map((n) => ({
            eventoId: e.id, titulo: e.titulo, data: somarDias(dataPrazo, -n), tipo: "lembrete" as const, dataPrazo,
          }));
      itens.push({ eventoId: e.id, titulo: e.titulo, data: dataPrazo, tipo: "prazo", dataPrazo });
      for (const it of itens) {
        if (e.lembretesAPartirDe && it.data < e.lembretesAPartirDe) continue;
        if (it.data >= de && it.data <= ate) out.push(it);
      }
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === "prazo" ? -1 : 1));
}

/** Próximos prazos (não lembretes) a partir de `data`, com dias restantes. */
export function proximosPrazos(eventos: Evento[], data: string, horizonteDias = 45) {
  return ocorrenciasDePrazos(eventos, data, somarDias(data, horizonteDias))
    .filter((o) => o.tipo === "prazo")
    .map((o) => ({ ...o, faltam: diasEntre(data, o.data) }));
}
