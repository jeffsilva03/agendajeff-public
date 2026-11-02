import type { Cadeia } from "@motor";

/** Cor da etiqueta de uma cadeia: manhã âmbar, tarde azul, trajetos coral, fim de semana violeta. */
export function corDaCadeia(c: Pick<Cadeia, "nome" | "periodo" | "dependeAula" | "diasSemana">): string {
  if (c.dependeAula) return "var(--tag-trajeto)";
  if (!c.diasSemana.some((d) => d >= 1 && d <= 5)) return "var(--tag-fds)";
  if (c.periodo === "manha") return "var(--tag-manha)";
  if (c.periodo === "tarde") return "var(--tag-tarde)";
  return "var(--tag-flex)";
}

export const COR_FLEXIVEL = "var(--tag-flex)";

const CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function rotuloDias(dias: number[]): string {
  const s = [...dias].sort().join(",");
  if (s === "1,2,3,4,5") return "seg a sex";
  if (s === "0,6") return "sáb e dom";
  if (s === "0,1,2,3,4,5,6") return "todos os dias";
  return [...dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => CURTO[d]).join(", ");
}

export const DIA_SEMANA_LONGO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const MES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "terça, 13 de outubro" */
export function dataPorExtenso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const nome = DIA_SEMANA_LONGO[w];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${d} de ${MES_LONGO[m - 1]}`;
}

/** "Ter, 13 out" (cabe no topo do celular) */
export function dataCurta(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const nome = DIA_SEMANA_LONGO[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1, 3)}, ${d} ${MES_CURTO[m - 1]}`;
}

/** "13/10" */
export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export { horaCurta } from "@motor";

/** Cores das disciplinas (identidade; texto sempre na cor de texto, a cor vai na marca ao lado). */
export const CORES_DISCIPLINA: Record<string, { nome: string; hex: string }> = {
  azul: { nome: "Azul", hex: "#6b93f5" },
  verde: { nome: "Verde", hex: "#3ccf86" },
  ambar: { nome: "Âmbar", hex: "#f2b84b" },
  coral: { nome: "Coral", hex: "#f07a65" },
  violeta: { nome: "Violeta", hex: "#a78bfa" },
  ciano: { nome: "Ciano", hex: "#34c3b0" },
  rosa: { nome: "Rosa", hex: "#f472b6" },
  cinza: { nome: "Cinza", hex: "#8c95a3" },
};
export const corDisciplina = (cor: string | null | undefined) => CORES_DISCIPLINA[cor ?? ""]?.hex ?? CORES_DISCIPLINA.cinza.hex;
