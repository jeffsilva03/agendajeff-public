import { describe, expect, it } from "vitest";
import { adesaoPorDiaSemana, adesaoPorPeriodo, coocorrencia, estadoLimiar, quebraDeCadeia, revisaoSemanal, somarDias, type Check } from "@motor";
import { normalizar, type DadosIniciais } from "@/lib/importar-dados";
import dados from "../fixtures/dados-exemplo.json";

const ctx = normalizar(dados as unknown as DadosIniciais);
const ck = (habitoId: string, data: string, status: Check["status"]): Check => ({ habitoId, data, status });
const minimos = new Map(ctx.cadeias.flatMap((c) => c.passos.map((p) => [p.habitoId, p.minimo] as [string, string | null])));

describe("limiares", () => {
  it("com zero dias, todos bloqueados com a contagem exata", () => {
    expect(estadoLimiar("adesao", 0)).toEqual({ exige: 7, pronto: false, faltam: 7 });
    expect(estadoLimiar("quebra", 0).faltam).toBe(10);
    expect(estadoLimiar("periodo", 0).faltam).toBe(14);
    expect(estadoLimiar("diaSemana", 0).faltam).toBe(21);
    expect(estadoLimiar("coocorrencia", 3)).toEqual({ exige: 21, pronto: false, faltam: 18 });
    expect(estadoLimiar("adesao", 9).pronto).toBe(true);
  });
});

describe("quebra de cadeia", () => {
  it("conta onde a Manhã para; hoje incompleto fica de fora", () => {
    const checks = [
      ck("acordar", "2026-10-14", "completo"), ck("pausa", "2026-10-14", "completo"), // para no Celular
      ck("acordar", "2026-10-15", "completo"), ck("pausa", "2026-10-15", "minimo"), ck("celular", "2026-10-15", "completo"), ck("tech", "2026-10-15", "completo"),
      ck("acordar", "2026-10-16", "completo"), // hoje, incompleto
    ];
    const manha = quebraDeCadeia(ctx, checks, "2026-10-14", "2026-10-16").find((q) => q.cadeiaId === "manha")!;
    expect(manha.dias).toBe(2);
    expect(manha.completas).toBe(1);
    expect(manha.paradas.find((p) => p.habitoId === "celular")!.vezes).toBe(1);
  });
});

describe("períodos e dias da semana", () => {
  it("mínimo conta, não se aplica sai; flexível é 'livre'", () => {
    const checks = [ck("acordar", "2026-10-13", "minimo"), ck("pausa", "2026-10-13", "nao_feito"), ck("alongamento", "2026-10-13", "nao_se_aplica"), ck("leitura", "2026-10-13", "completo")];
    const p = adesaoPorPeriodo(ctx, checks, "2026-10-13", "2026-10-14");
    expect(p.find((x) => x.periodo === "manha")).toMatchObject({ feitos: 1, total: 4 });
    expect(p.find((x) => x.periodo === "livre")).toMatchObject({ feitos: 1, total: 2 });
    const d = adesaoPorDiaSemana(ctx, checks, "2026-10-13", "2026-10-14");
    expect(d.find((x) => x.diaSemana === 2)!.total).toBe(8); // terça: 9 itens menos o alongamento não se aplica
  });
});

describe("coocorrência", () => {
  it("detecta quando fazer A puxa B", () => {
    const checks: Check[] = [];
    for (let i = 0; i < 12; i++) {
      const d = somarDias("2026-10-14", i);
      const fezPausa = i % 2 === 0;
      checks.push(ck("pausa", d, fezPausa ? "completo" : "nao_feito"));
      checks.push(ck("acordar", d, fezPausa ? "completo" : "nao_feito"));
    }
    const pares = coocorrencia(ctx, checks, "2026-10-14", "2026-10-25", 5);
    expect(pares.some((p) => p.a === "pausa" && p.b === "acordar" && p.diferenca === 1)).toBe(true);
  });
});

describe("revisão semanal", () => {
  it("sem registros: avisa e não inventa sugestão", () => {
    const r = revisaoSemanal(ctx, [], "2026-10-18", minimos);
    expect(r.sugestao.tipo).toBe("sem_dados");
    expect(r.adesao).toBeNull();
  });
  it("hábito abaixo de 50%: sugere reduzir o mínimo citando o atual", () => {
    const checks: Check[] = [];
    const outros = ["acordar", "pausa", "celular", "candidatura", "portfolio", "ingles", "leitura", "alongamento"];
    for (let i = 0; i < 5; i++) {
      const d = somarDias("2026-10-12", i);
      checks.push(ck("tech", d, i === 0 ? "completo" : "nao_feito"));
      for (const o of outros) checks.push(ck(o, d, "completo"));
    }
    const r = revisaoSemanal(ctx, checks, "2026-10-18", minimos);
    expect(r.sugestao.tipo).toBe("reduzir_minimo");
    expect(r.sugestao.texto).toContain("25 minutos (1 pomodoro)");
  });
});
