import { describe, expect, it } from "vitest";
import { conteudoLembrete, ocorrenciasDePrazos, proximosPrazos, resolverDia, agoraSP, dentroDaJanela, type Check } from "@motor";
import { normalizar, type DadosIniciais } from "@/lib/importar-dados";
import dados from "../fixtures/dados-exemplo.json";

const ctx = normalizar(dados as unknown as DadosIniciais);
const nomes = (d: ReturnType<typeof resolverDia>) => d.cadeias.map((c) => c.nome);
const flex = (d: ReturnType<typeof resolverDia>) => d.flexiveis.map((h) => h.id);

describe("primeira semana (cenário fictício de regressão)", () => {
  const esperado: Record<string, { cadeias: string[]; flex: string[] }> = {
    "2026-10-13": { cadeias: ["Manhã", "Tarde"], flex: ["ingles", "leitura", "alongamento"] },
    "2026-10-14": { cadeias: ["Manhã", "Tarde", "Trajeto de ida", "Trajeto de volta"], flex: [] },
    "2026-10-15": { cadeias: ["Manhã", "Tarde", "Trajeto de ida", "Trajeto de volta"], flex: [] },
    "2026-10-16": { cadeias: ["Manhã", "Tarde", "Trajeto de ida", "Trajeto de volta"], flex: [] },
    "2026-10-17": { cadeias: ["Tarde/noite de fim de semana"], flex: ["alongamento"] },
    "2026-10-18": { cadeias: ["Manhã de domingo", "Tarde/noite de fim de semana"], flex: ["alongamento"] },
    "2026-10-19": { cadeias: ["Manhã", "Tarde", "Trajeto de ida", "Trajeto de volta"], flex: [] },
  };
  for (const [data, e] of Object.entries(esperado)) {
    it(data, () => {
      const d = resolverDia(data, ctx);
      expect(nomes(d)).toEqual(e.cadeias);
      expect(flex(d)).toEqual(e.flex);
    });
  }
});

describe("terça 13/10 (aceite do marco 2)", () => {
  const d = resolverDia("2026-10-13", ctx);
  it("sem aula pela exceção", () => {
    expect(d.temAula).toBe(false);
    expect(d.motivoSemAula).toBe("Sem aula");
  });
  it("reunião das 13h sem término, colidindo só com a Tarde", () => {
    expect(d.compromissos).toHaveLength(1);
    expect(d.compromissos[0]).toMatchObject({ inicio: "13:00", fim: null, local: "Sala de exemplo" });
    expect(d.avisos.map((a) => a.cadeiaId)).toEqual(["tarde"]);
  });
  it("Pausa da manhã não antes de 6h30", () => {
    expect(d.cadeias[0].passos.find((p) => p.habitoId === "pausa")?.naoAntes).toBe("06:30");
  });
});

describe("feriados", () => {
  it("02/11 (Finados, segunda) vira sem aula automaticamente", () => {
    const d = resolverDia("2026-11-02", ctx);
    expect(d.motivoSemAula).toBe("Feriado: Finados");
    expect(nomes(d)).toEqual(["Manhã", "Tarde"]);
    expect(flex(d)).toEqual(["ingles", "leitura", "alongamento"]);
  });
  it("exceção com_aula desfaz o feriado", () => {
    const c2 = { ...ctx, eventos: [...ctx.eventos, { id: "x", tipo: "excecao_rotina" as const, titulo: "Tem aula", data: "2026-11-20", inicio: null, fim: null, local: null, recorrencia: null, lembretesDias: [], lembretesAPartirDe: null, efeito: { com_aula: true } }] };
    expect(resolverDia("2026-11-20", c2).temAula).toBe(true);
    expect(resolverDia("2026-11-20", ctx).temAula).toBe(false);
  });
  it("feriado em fim de semana não muda nada (15/11 é domingo)", () => {
    expect(nomes(resolverDia("2026-11-15", ctx))).toEqual(["Manhã de domingo", "Tarde/noite de fim de semana"]);
  });
});

describe("colisão por janela", () => {
  const comp = (data: string, inicio: string) => ({ ...ctx, eventos: [...ctx.eventos, { id: "c", tipo: "compromisso" as const, titulo: "X", data, inicio, fim: null, local: null, recorrencia: null, lembretesDias: [], lembretesAPartirDe: null, efeito: null }] });
  it("9h colide com Manhã, não com Tarde", () => {
    expect(resolverDia("2026-10-14", comp("2026-10-14", "09:00")).avisos.map((a) => a.cadeiaId)).toEqual(["manha"]);
  });
  it("17h colide com Trajeto de ida; 22h30 com Trajeto de volta", () => {
    expect(resolverDia("2026-10-14", comp("2026-10-14", "17:00")).avisos.map((a) => a.cadeiaId)).toEqual(["trajeto-de-ida"]);
    expect(resolverDia("2026-10-14", comp("2026-10-14", "22:30")).avisos.map((a) => a.cadeiaId)).toEqual(["trajeto-de-volta"]);
    expect(dentroDaJanela("00:15", "21:00", "01:00")).toBe(true);
    expect(dentroDaJanela("01:00", "21:00", "01:00")).toBe(false);
  });
  it("fim de semana não tem janela, então não avisa", () => {
    expect(resolverDia("2026-10-17", comp("2026-10-17", "15:00")).avisos).toEqual([]);
  });
});

describe("prazo recorrente de exemplo (aceite do marco 4)", () => {
  it("lembretes em 01/11 e 09/11, prazo em 10/11; outubro fora", () => {
    const o = ocorrenciasDePrazos(ctx.eventos, "2026-10-01", "2026-11-30");
    expect(o.map((x) => `${x.data}:${x.tipo}`)).toEqual(["2026-11-01:lembrete", "2026-11-09:lembrete", "2026-11-10:prazo"]);
  });
  it("próximos prazos a partir de 13/10 trazem 10/11 com 28 dias", () => {
    expect(proximosPrazos(ctx.eventos, "2026-10-13")[0]).toMatchObject({ data: "2026-11-10", faltam: 28 });
  });
});

describe("lembretes", () => {
  const sem: Check[] = [];
  it("8h de terça 13/10: manhã com 4 de 4 pendentes, próximo Acordar", () => {
    const l = conteudoLembrete("08:00", resolverDia("2026-10-13", ctx), sem, ctx.habitos);
    expect(l?.corpo).toBe("Manhã: 4 de 4 passos pendentes, próximo é Começar o dia");
    expect(l?.url).toBe("/hoje#manha");
  });
  it("após marcar 1 passo, conta 3 de 4 e próximo é Pausa", () => {
    const l = conteudoLembrete("08:00", resolverDia("2026-10-13", ctx), [{ habitoId: "acordar", data: "2026-10-13", status: "minimo" }], ctx.habitos);
    expect(l?.corpo).toContain("3 de 4 passos pendentes, próximo é Pausa consciente");
  });
  it("13h de dia sem aula inclui Tarde e flexíveis", () => {
    const l = conteudoLembrete("13:00", resolverDia("2026-10-13", ctx), sem, ctx.habitos);
    expect(l?.corpo.split("\n")).toEqual([
      "Tarde: 2 de 2 passos pendentes, próximo é Enviar candidaturas",
      "Flexíveis: Praticar inglês, Leitura, Alongamento",
    ]);
  });
  it("13h de dia com aula avisa o Trajeto de ida junto com a Tarde", () => {
    const l = conteudoLembrete("13:00", resolverDia("2026-10-14", ctx), sem, ctx.habitos);
    expect(l?.corpo).toContain("Trajeto de ida: 2 de 2");
  });
  it("sábado 8h sem nada pendente não gera lembrete", () => {
    expect(conteudoLembrete("08:00", resolverDia("2026-10-17", ctx), sem, ctx.habitos)).toBeNull();
  });
  it("domingo: o passeio com lembrete desativado não aparece", () => {
    const d = resolverDia("2026-10-18", ctx);
    expect(conteudoLembrete("08:00", d, sem, ctx.habitos)).toBeNull();
    for (const h of ["13:00", "23:00"]) {
      const l = conteudoLembrete(h, d, sem, ctx.habitos);
      expect(l?.corpo).not.toMatch(/passeio|Manhã de domingo/i);
    }
  });
  it("tudo marcado: 23h não envia", () => {
    const d = resolverDia("2026-10-14", ctx);
    const todos = d.cadeias.flatMap((c) => c.passos.map((p) => ({ habitoId: p.habitoId, data: d.data, status: "completo" as const })));
    expect(conteudoLembrete("23:00", d, todos, ctx.habitos)).toBeNull();
  });
  it("prazo sai no slot das 8h, mesmo em sábado", () => {
    // 10/04/2027 é sábado
    const l = conteudoLembrete("08:00", resolverDia("2027-04-10", ctx), sem, ctx.habitos);
    expect(l?.corpo).toBe("Prazo hoje: Prazo: revisão mensal de exemplo");
  });
});

describe("fuso", () => {
  it("00:30 UTC de 14/10 ainda é 13/10 em São Paulo", () => {
    expect(agoraSP(new Date("2026-10-14T00:30:00Z"))).toEqual({ data: "2026-10-13", hora: "21:30" });
  });
});

describe("texto do aviso", () => {
  it("usa hora curta", () => {
    expect(resolverDia("2026-10-13", ctx).avisos[0].texto).toBe("Reunião de exemplo às 13h colide com a cadeia Tarde");
  });
});

describe("prazo único com lembrete antecipado (freela)", () => {
  const freela = { id: "freela-1", tipo: "prazo" as const, titulo: "Entrega: Site (Cliente X)", data: "2026-11-05", inicio: null, fim: null, local: null, recorrencia: null, lembretesDias: [], lembretesAntes: [1], lembretesAPartirDe: null, efeito: null };
  const c2 = { ...ctx, eventos: [...ctx.eventos, freela] };
  it("lembrete na véspera e prazo no dia", () => {
    expect(ocorrenciasDePrazos(c2.eventos, "2026-11-04", "2026-11-04").map((o) => `${o.data}:${o.tipo}`)).toEqual(["2026-11-04:lembrete"]);
    expect(ocorrenciasDePrazos(c2.eventos, "2026-11-05", "2026-11-05").map((o) => `${o.data}:${o.tipo}`)).toEqual(["2026-11-05:prazo"]);
  });
  it("sai no lembrete das 8h da véspera", () => {
    const l = conteudoLembrete("08:00", resolverDia("2026-11-04", c2), [], c2.habitos);
    expect(l?.corpo).toContain("Lembrete: Entrega: Site (Cliente X) (prazo 05/11)");
  });
});
