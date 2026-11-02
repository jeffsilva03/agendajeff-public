import { describe, expect, it } from "vitest";
import { historico, resumir, diasComRegistro, type Check } from "@motor";
import { normalizar, type DadosIniciais } from "@/lib/importar-dados";
import dados from "../fixtures/dados-exemplo.json";

const ctx = normalizar(dados as unknown as DadosIniciais);
const ck = (habitoId: string, data: string, status: Check["status"]): Check => ({ habitoId, data, status });

describe("histórico", () => {
  it("alongamento vale todo dia (trajeto ou flexível); passeio só domingo", () => {
    const h = historico(ctx, [], "2026-10-13", "2026-10-19");
    expect(h.get("alongamento")!.map((d) => d.estado)).toEqual(Array(7).fill("sem_registro"));
    expect(h.get("passeio")!.map((d) => d.estado)).toEqual(["fora", "fora", "fora", "fora", "fora", "sem_registro", "fora"]);
  });
});

describe("resumo", () => {
  it("sem checks: adesão nula até haver dia vencido, nada inventado", () => {
    const r = resumir(historico(ctx, [], "2026-10-13", "2026-10-13").get("tech")!, "2026-10-13");
    expect(r).toMatchObject({ diasQueValeram: 0, adesao: null, sequenciaAtual: 0, diasPraticados: 0 });
  });
  it("mínimo conta como feito; não se aplica fica fora do denominador e não quebra a sequência", () => {
    const checks = [
      ck("tech", "2026-10-13", "completo"),
      ck("tech", "2026-10-14", "minimo"),
      ck("tech", "2026-10-15", "nao_se_aplica"),
      ck("tech", "2026-10-16", "completo"),
    ];
    // 17 e 18 são fim de semana: tech não vale ("fora"), não quebra sequência
    const r = resumir(historico(ctx, checks, "2026-10-13", "2026-10-19").get("tech")!, "2026-10-19");
    expect(r).toMatchObject({ diasQueValeram: 3, completos: 2, minimos: 1, adesao: 1, sequenciaAtual: 3, melhorSequencia: 3, diasPraticados: 3 });
  });
  it("dia em que usou o app mas não marcou o hábito conta como não feito", () => {
    const checks = [ck("tech", "2026-10-13", "completo"), ck("acordar", "2026-10-14", "completo"), ck("tech", "2026-10-15", "completo")];
    const r = resumir(historico(ctx, checks, "2026-10-13", "2026-10-15").get("tech")!, "2026-10-15");
    expect(r).toMatchObject({ diasQueValeram: 3, adesao: 2 / 3, sequenciaAtual: 1, melhorSequencia: 1 });
  });
  it("dia sem nenhum registro fica fora da adesão, mas quebra a sequência", () => {
    const checks = [ck("tech", "2026-10-13", "completo"), ck("tech", "2026-10-15", "completo")];
    const h = historico(ctx, checks, "2026-10-13", "2026-10-15").get("tech")!;
    expect(h[1].estado).toBe("sem_registro");
    expect(resumir(h, "2026-10-15")).toMatchObject({ diasQueValeram: 2, adesao: 1, sequenciaAtual: 1, melhorSequencia: 1 });
  });
  it("hoje pendente não derruba a sequência", () => {
    const checks = [ck("tech", "2026-10-13", "completo")];
    const r = resumir(historico(ctx, checks, "2026-10-13", "2026-10-14").get("tech")!, "2026-10-14");
    expect(r).toMatchObject({ sequenciaAtual: 1, diasQueValeram: 1 });
  });
  it("dias com registro", () => {
    expect(diasComRegistro([ck("a", "2026-10-13", "completo"), ck("b", "2026-10-13", "minimo"), ck("a", "2026-10-14", "nao_feito")])).toBe(2);
  });
});
