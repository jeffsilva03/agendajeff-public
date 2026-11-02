// Executa o script do widget num simulador mínimo da API do Scriptable (só o que o script usa),
// nos três tamanhos e no caso de erro. Não substitui o teste no iPhone, mas pega erro de lógica e de digitação.
import { describe, expect, it } from "vitest";
import { scriptDoWidget } from "@/lib/widget-scriptable";

const RESUMO = {
  data: "2026-10-20", dia: "Ter, 20 out", atualizado: "10:05", semAula: null,
  habitos: { feitos: 3, total: 9, pct: 1 / 3, texto: "3/9 hábitos" },
  proximo: { nome: "Estudo Tech", grupo: "Manhã" },
  tarefas: [{ titulo: "Imprimir o trabalho", hora: "15h", importante: true }, { titulo: "Recarregar o bilhete", hora: null, importante: false }],
  tarefasTotal: 2,
  agenda: [{ hora: "18h30", titulo: "Aula" }],
  sequencia: { nome: "Leitura", dias: 6 },
  metas: [{ titulo: "Ler livros", pct: 0.75, texto: "3/4" }, { titulo: "Entregar o projeto", pct: 0, texto: "a fazer" }],
  frase: "Progresso, não perfeição.",
};

function simulador(familia: string, resposta: { status: number; corpo: unknown }) {
  const textos: string[] = [];
  let widgetFinal: unknown = null;
  class Pilha {
    filhos: unknown[] = [];
    backgroundColor: unknown; cornerRadius = 0; borderColor: unknown; borderWidth = 0; size: unknown;
    addStack() { const p = new Pilha(); this.filhos.push(p); return p; }
    addText(t: string) { textos.push(t); const x = { text: t, font: null, textColor: null, lineLimit: 0, minimumScaleFactor: 1 }; this.filhos.push(x); return x; }
    addImage(img: unknown) { if (!img) throw new Error("imagem vazia"); const x = { image: img, imageSize: null, tintColor: null }; this.filhos.push(x); return x; }
    addSpacer() {}
    layoutVertically() {} layoutHorizontally() {} centerAlignContent() {} topAlignContent() {}
    setPadding() {}
  }
  class ListWidget extends Pilha {
    url = ""; refreshAfterDate: unknown; backgroundGradient: unknown;
    async presentSmall() {} async presentMedium() {} async presentLarge() {}
  }
  class Color { constructor(public hex: string, public alpha = 1) { if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`cor inválida ${hex}`); } }
  const Font = Object.fromEntries(["systemFont", "boldSystemFont", "semiboldSystemFont", "mediumSystemFont", "boldRoundedSystemFont", "semiboldRoundedSystemFont", "mediumRoundedSystemFont", "regularRoundedSystemFont"]
    .map((n) => [n, (s: number) => { if (!(s > 0)) throw new Error(`tamanho de fonte inválido: ${s}`); return { n, s }; }]));
  class Size { constructor(public w: number, public h: number) {} }
  class Rect { constructor(public x: number, public y: number, public w: number, public h: number) { if ([x, y, w, h].some(Number.isNaN)) throw new Error("retângulo NaN"); } }
  class Point { constructor(public x: number, public y: number) { if (Number.isNaN(x) || Number.isNaN(y)) throw new Error("ponto NaN"); } }
  class Path { addLines(p: unknown[]) { if (!p.length) throw new Error("caminho vazio"); } addRoundedRect() {} }
  class DrawContext {
    size: unknown; opaque = true; respectScreenScale = true;
    setStrokeColor() {} setFillColor() {} setLineWidth() {} strokeEllipse() {} fillEllipse() {} addPath() {} strokePath() {} fillPath() {}
    setTextAlignedCenter() {} setTextColor() {} setFont() {} drawTextInRect() {}
    getImage() { return { imagem: true }; }
  }
  class LinearGradient { colors: unknown[] = []; locations: number[] = []; startPoint: unknown; endPoint: unknown; }
  const SFSymbol = { named: (n: string) => ({ n, applyFont() {}, image: { simbolo: n } }) };
  class Request {
    headers: Record<string, string> = {}; timeoutInterval = 0; response = { statusCode: 0 };
    constructor(public url: string) {}
    async loadJSON() { this.response.statusCode = resposta.status; return resposta.corpo; }
  }
  const Script = { setWidget: (w: unknown) => { widgetFinal = w; }, complete() {} };
  const config = { widgetFamily: familia, runsInWidget: true };
  return { textos, final: () => widgetFinal, globais: { ListWidget, Color, Font, Size, Rect, Point, Path, DrawContext, LinearGradient, SFSymbol, Request, Script, config } };
}

async function rodar(familia: string, resposta: { status: number; corpo: unknown }) {
  const sim = simulador(familia, resposta);
  const FuncaoAssincrona = Object.getPrototypeOf(async () => {}).constructor;
  const nomes = Object.keys(sim.globais);
  await new FuncaoAssincrona(...nomes, scriptDoWidget("https://agenda.example.com", "wjt_teste"))(...nomes.map((n) => sim.globais[n as keyof typeof sim.globais]));
  return sim;
}

describe("widget do iPhone (Scriptable)", () => {
  for (const familia of ["small", "medium", "large"]) {
    it(`monta o tamanho ${familia} sem erro e com o conteúdo do dia`, async () => {
      const sim = await rodar(familia, { status: 200, corpo: RESUMO });
      expect(sim.final()).toBeTruthy();
      const tudo = sim.textos.join(" | ");
      expect(tudo).toContain("Estudo Tech");
      expect(tudo).toContain("10h05"); // hora da última busca, em todos os tamanhos
      if (familia !== "small") expect(tudo).toMatch(/Imprimir o trabalho|Aula/);
      if (familia === "large") {
        expect(tudo).toContain("Ler livros");
        expect(tudo).toContain("Progresso, não perfeição.");
        expect(tudo).toContain("6 dias · Leitura");
      }
    });
  }
  it("dia sem nada pendente e sem metas", async () => {
    const sim = await rodar("large", { status: 200, corpo: { ...RESUMO, proximo: null, tarefas: [], tarefasTotal: 0, agenda: [], metas: [], sequencia: null, habitos: { feitos: 9, total: 9, pct: 1, texto: "9/9" } } });
    expect(sim.textos.join(" | ")).toContain("Dia fechado");
  });
  it("token revogado mostra o erro em vez de quebrar", async () => {
    const sim = await rodar("medium", { status: 401, corpo: { erro: "não autorizado" } });
    expect(sim.textos.join(" | ")).toContain("Não deu para carregar: não autorizado");
  });
});
