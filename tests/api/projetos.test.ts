import { describe, expect, it } from "vitest";
import { desdeStatus, haQuanto, lerTecnologias, ordenarFeatures, ordenarProjetos, progressoProjeto, proximoStatusFeature } from "@/lib/projetos";

describe("projetos", () => {
  it("progresso geral e do MVP pelas features", () => {
    const p = progressoProjeto([
      { status: "feito", prioridade: "essencial" }, { status: "fazendo", prioridade: "essencial" },
      { status: "a_fazer", prioridade: "extra" }, { status: "feito", prioridade: "importante" },
    ]);
    expect(p).toMatchObject({ feitas: 2, total: 4, pct: 0.5, mvpFeitas: 1, mvpTotal: 2, mvpPct: 0.5, fazendo: 1 });
    expect(progressoProjeto([])).toMatchObject({ pct: null, mvpPct: null });
  });
  it("lista: fixado, depois status, prioridade e o mais recente", () => {
    const base = { atualizado_em: "2026-10-01T10:00:00Z", fixado: false, prioridade: "media" as const };
    const l = ordenarProjetos([
      { ...base, id: "ideia", status: "ideia" as const },
      { ...base, id: "dev-baixa", status: "desenvolvendo" as const, prioridade: "baixa" as const },
      { ...base, id: "dev-alta", status: "desenvolvendo" as const, prioridade: "alta" as const },
      { ...base, id: "fixo", status: "pausado" as const, fixado: true },
    ]);
    expect(l.map((x) => x.id)).toEqual(["fixo", "dev-alta", "dev-baixa", "ideia"]);
  });
  it("features: fazendo, a fazer com essenciais antes, feitas no fim", () => {
    const l = ordenarFeatures([
      { id: "a", status: "feito" as const, prioridade: "essencial" as const, ordem: 0 },
      { id: "b", status: "a_fazer" as const, prioridade: "extra" as const, ordem: 1 },
      { id: "c", status: "a_fazer" as const, prioridade: "essencial" as const, ordem: 2 },
      { id: "d", status: "fazendo" as const, prioridade: "importante" as const, ordem: 3 },
    ]);
    expect(l.map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
    expect([proximoStatusFeature("a_fazer"), proximoStatusFeature("fazendo"), proximoStatusFeature("feito")]).toEqual(["fazendo", "feito", "a_fazer"]);
  });
  it("tecnologias e tempo relativo", () => {
    expect(lerTecnologias(" Next.js, supabase ,, next.js, Tailwind ")).toEqual(["Next.js", "supabase", "Tailwind"]);
    expect(haQuanto("2026-10-20T15:00:00Z", "2026-10-20")).toBe("hoje");
    expect(haQuanto("2026-10-19T15:00:00Z", "2026-10-20")).toBe("ontem");
    expect(haQuanto("2026-10-08T15:00:00Z", "2026-10-20")).toBe("há 12 dias");
    expect(haQuanto("2026-08-20T15:00:00Z", "2026-10-20")).toBe("há 2 meses");
    expect(desdeStatus("2026-10-20T15:00:00Z", "2026-10-20")).toBe("Neste status desde hoje");
    expect(desdeStatus("2026-10-08T15:00:00Z", "2026-10-20")).toBe("Neste status há 12 dias");
  });
});
