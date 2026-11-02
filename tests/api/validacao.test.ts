import { describe, expect, it } from "vitest";
import { esquemas, lerParametros, validarIntervalo } from "@/lib/api/parametros";
import { ErroApi, dataHoraSP, isoSP, paginar } from "@/lib/api/respostas";
import { origemDoEvento, statusHabito } from "@/lib/api/formatos";
import { escaparLike } from "@/lib/api/servicos/busca";

const url = (q: string) => new URL(`http://x/api?${q}`);
const erro = (f: () => unknown) => {
  try { f(); } catch (e) { return e as ErroApi; }
  throw new Error("não lançou");
};

describe("parâmetros", () => {
  it("aceita data válida e recusa data inexistente ou mal formatada", () => {
    expect(lerParametros(url("date=2026-10-13"), esquemas.hoje).date).toBe("2026-10-13");
    expect(erro(() => lerParametros(url("date=2026-02-30"), esquemas.hoje)).codigo).toBe("parametro_invalido");
    expect(erro(() => lerParametros(url("date=13/10/2026"), esquemas.hoje)).codigo).toBe("parametro_invalido");
  });
  it("recusa parâmetro desconhecido e repetido", () => {
    expect(erro(() => lerParametros(url("user_id=abc"), esquemas.hoje)).detalhes).toEqual([{ param: "user_id", message: "parâmetro desconhecido" }]);
    expect(erro(() => lerParametros(url("date=2026-10-13&date=2026-10-14"), esquemas.hoje)).codigo).toBe("parametro_invalido");
  });
  it("paginação com teto e padrão", () => {
    expect(lerParametros(url(""), esquemas.tarefas)).toMatchObject({ limit: 50, offset: 0, status: "all" });
    expect(erro(() => lerParametros(url("limit=101"), esquemas.tarefas)).codigo).toBe("parametro_invalido");
    expect(erro(() => lerParametros(url("offset=-1"), esquemas.tarefas)).codigo).toBe("parametro_invalido");
  });
  it("listas só com valores conhecidos", () => {
    expect(lerParametros(url("status=enviada,entrevista"), esquemas.candidaturas).status).toEqual(["enviada", "entrevista"]);
    expect(erro(() => lerParametros(url("status=enviada,DROP"), esquemas.candidaturas)).codigo).toBe("parametro_invalido");
  });
  it("busca exige termo de 2 a 60 caracteres", () => {
    expect(erro(() => lerParametros(url("q=a"), esquemas.busca)).codigo).toBe("parametro_invalido");
    expect(erro(() => lerParametros(url(`q=${"x".repeat(61)}`), esquemas.busca)).codigo).toBe("parametro_invalido");
  });
  it("intervalo: ordem e teto de dias", () => {
    expect(() => validarIntervalo("2026-10-01", "2026-12-01")).not.toThrow();
    expect(erro(() => validarIntervalo("2026-10-01", "2026-12-02")).detalhes).toEqual([{ param: "end", message: "intervalo máximo de 62 dias" }]);
    expect(erro(() => validarIntervalo("2026-10-10", "2026-10-01")).codigo).toBe("parametro_invalido");
  });
});

describe("segurança da busca", () => {
  it("curingas do LIKE viram literais e * sai do termo", () => {
    expect(escaparLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(escaparLike("a*b")).toBe("ab");
    expect(escaparLike("'; drop table tarefas; --")).toBe("'; drop table tarefas; --"); // vai como valor do filtro, nunca como SQL
  });
});

describe("respostas e formatos", () => {
  it("datas com o deslocamento de São Paulo", () => {
    expect(isoSP(new Date("2026-10-12T18:00:00Z"))).toBe("2026-10-12T15:00:00-03:00");
    expect(dataHoraSP("2026-10-13", "13:00")).toBe("2026-10-13T13:00:00-03:00");
    expect(dataHoraSP("2026-10-13", null)).toBeNull();
  });
  it("erros com status estável", () => {
    expect(new ErroApi("token_invalido").status).toBe(401);
    expect(new ErroApi("integracao_desativada").status).toBe(403);
    expect(new ErroApi("limite_excedido").status).toBe(429);
  });
  it("origem dos itens da agenda e status dos hábitos", () => {
    expect(origemDoEvento("avaliacao-123")).toEqual({ source: "college", sourceId: "123" });
    expect(origemDoEvento("abc")).toEqual({ source: "event", sourceId: "abc" });
    expect(statusHabito("nao_se_aplica")).toBe("not_applicable");
    expect(statusHabito(undefined)).toBe("pending");
  });
  it("paginação", () => {
    expect(paginar([1, 2, 3, 4, 5], 2, 2)).toEqual({ itens: [3, 4], pagination: { limit: 2, offset: 2, total: 5, hasMore: true } });
  });
});
