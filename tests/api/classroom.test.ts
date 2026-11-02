// Regras da integração com o Classroom sobre respostas no formato real do APIClassroom (dados fictícios,
// com os ids de referência do handoff só como formato).
import { describe, expect, it } from "vitest";
import { classroomParaEvento, prazoLocal, situacaoClassroom, situacaoEfetiva } from "@motor";
import { compararSnapshot, juntarPorAtividade, linkSeguro, normalizarAtividade } from "@/lib/classroom/normalizar";
import { entregasDaSemana, filtrar, indicadores, textoPrazo, type AtividadeClassroom } from "@/lib/classroom/painel";
import type { AtividadeApi, EntregaApi } from "@/lib/classroom/tipos";

const CURSO = "900000000001";
const COMPARTILHADA = "900000000002"; // Automação / Projeto Integrador / Extensão: uma turma só
const atividade = (id: string, extra: Partial<AtividadeApi> = {}, curso = CURSO): AtividadeApi => ({
  id, disciplina_id: curso, disciplina_nome: "Computação em Nuvem de exemplo", titulo: `Atividade ${id}`, descricao: "Descrição", descricao_truncada: false,
  tipo: "ASSIGNMENT", estado_publicacao: "PUBLISHED", criado_em: "2026-10-14T15:04:06.700Z", atualizado_em: "2026-10-20T00:02:57.882Z",
  link: `https://classroom.google.com/c/x/a/${id}/details`, anexos: [], pontuacao_maxima: 100,
  prazo: { em_utc: "2026-10-22T02:59:00+00:00", em_sao_paulo: "2026-10-21T23:59:00-03:00", precisao: "instante", situacao_temporal: "futuro" },
  ...extra,
});
const entrega = (atividadeId: string, estado: string | null, extra: Partial<EntregaApi> = {}, curso = CURSO): EntregaApi => ({
  id: `sub-${atividadeId}`, disciplina_id: curso, atividade_id: atividadeId, estado, atrasada_segundo_google: null, nota_atribuida: null,
  criado_em: "2026-10-14T15:13:13.279Z", atualizado_em: "2026-10-19T14:49:51.078Z", link: "https://classroom.google.com/sub", ...extra,
});
const ANTES = new Date("2026-10-20T12:00:00Z");
const DEPOIS = new Date("2026-10-23T12:00:00Z");

describe("prazos", () => {
  it("instante em UTC vira data e hora de São Paulo, sem conversão dupla", () => {
    expect(prazoLocal({ precisao: "instante", em: "2026-10-22T02:59:00+00:00", data: null })).toEqual({ data: "2026-10-21", hora: "23:59" });
  });
  it("só data não ganha horário inventado; sem prazo e incompleto não viram data", () => {
    const l = normalizarAtividade(atividade("1", { prazo: { em_utc: null, precisao: "somente_data_utc", data_utc: "2026-11-05", situacao_temporal: "incompleto" } }), undefined, CURSO)!;
    expect(l).toMatchObject({ prazo_precisao: "somente_data_utc", prazo_data: "2026-11-05", prazo_em: null });
    expect(prazoLocal({ precisao: l.prazo_precisao, em: l.prazo_em, data: l.prazo_data })).toEqual({ data: "2026-11-05", hora: null });
    expect(normalizarAtividade(atividade("2", { prazo: { em_utc: null, precisao: null, situacao_temporal: "sem_prazo" } }), undefined, CURSO)).toMatchObject({ prazo_precisao: "sem_prazo", prazo_em: null, prazo_data: null });
    expect(normalizarAtividade(atividade("3", { prazo: { em_utc: null, precisao: null, situacao_temporal: "incompleto" } }), undefined, CURSO)!.prazo_precisao).toBe("incompleto");
    expect(textoPrazo({ prazo_precisao: "sem_prazo", prazo_em: null, prazo_data: null })).toBe("Sem prazo informado");
    expect(textoPrazo({ prazo_precisao: "instante", prazo_em: "2026-10-22T02:59:00Z", prazo_data: null })).toBe("qua, 21/10 às 23h59");
    expect(textoPrazo({ prazo_precisao: "somente_data_utc", prazo_em: null, prazo_data: "2026-11-05" })).toBe("qui, 05/11 (sem horário)");
  });
});

describe("estados da entrega", () => {
  const p = { precisao: "instante" as const, em: "2026-10-22T02:59:00Z", data: null };
  it("PUBLISHED não é pendente: o estado vem da submissão", () => {
    expect(situacaoClassroom({ prazo: p, entregaEstado: "TURNED_IN", entregaAtrasada: null }, ANTES)).toBe("entregue");
    expect(situacaoClassroom({ prazo: p, entregaEstado: "TURNED_IN", entregaAtrasada: true }, DEPOIS)).toBe("entregue"); // entregue com atraso continua entregue
    expect(situacaoClassroom({ prazo: p, entregaEstado: "RETURNED", entregaAtrasada: null }, ANTES)).toBe("devolvida");
    for (const e of ["NEW", "CREATED", "RECLAIMED_BY_STUDENT"] as const) {
      expect(situacaoClassroom({ prazo: p, entregaEstado: e, entregaAtrasada: null }, ANTES)).toBe("pendente");
      expect(situacaoClassroom({ prazo: p, entregaEstado: e, entregaAtrasada: null }, DEPOIS)).toBe("atrasada");
    }
    expect(situacaoClassroom({ prazo: p, entregaEstado: null, entregaAtrasada: null }, DEPOIS)).toBe("nao_confirmada");
    // Atraso indicado pelo Google conta mesmo se o prazo local ainda não passou.
    expect(situacaoClassroom({ prazo: p, entregaEstado: "NEW", entregaAtrasada: true }, ANTES)).toBe("atrasada");
    // Sem prazo nunca vence.
    expect(situacaoClassroom({ prazo: { precisao: "sem_prazo", em: null, data: null }, entregaEstado: "NEW", entregaAtrasada: null }, DEPOIS)).toBe("pendente");
  });
  it("estado desconhecido vindo da API vira nulo; nota 0 é nota, nula é sem nota", () => {
    const [estranha] = juntarPorAtividade([atividade("9")], [entrega("9", "ALGO_NOVO")], CURSO);
    expect(estranha.entrega_estado).toBeNull();
    const [zero] = juntarPorAtividade([atividade("8")], [entrega("8", "RETURNED", { nota_atribuida: 0 })], CURSO);
    expect(zero.nota).toBe(0);
    const [nula] = juntarPorAtividade([atividade("7")], [entrega("7", "RETURNED")], CURSO);
    expect(nula.nota).toBeNull();
  });
});

describe("junção e deduplicação", () => {
  it("junta por (curso, atividade), sem repetir e sem misturar turmas", () => {
    const linhas = juntarPorAtividade(
      [atividade("900000000101"), atividade("900000000101"), atividade("2"), atividade("3", {}, "outro")],
      [entrega("900000000101", "TURNED_IN"), entrega("2", "NEW"), entrega("3", "TURNED_IN", {}, "outro")], CURSO);
    expect(linhas.map((l) => [l.activity_id, l.entrega_estado])).toEqual([["900000000101", "TURNED_IN"], ["2", "NEW"]]);
  });
  it("turma compartilhada (vários apelidos) gera uma linha por atividade, com o course_id original", () => {
    const linhas = juntarPorAtividade([atividade("A1", {}, COMPARTILHADA), atividade("A2", {}, COMPARTILHADA)], [], COMPARTILHADA);
    expect(linhas).toHaveLength(2);
    expect(new Set(linhas.map((l) => l.course_id))).toEqual(new Set([COMPARTILHADA]));
  });
  it("submissão repetida: vale a atualizada por último", () => {
    const [l] = juntarPorAtividade([atividade("5")], [entrega("5", "NEW", { atualizado_em: "2026-10-01T00:00:00Z" }), entrega("5", "TURNED_IN", { id: "outra", atualizado_em: "2026-10-02T00:00:00Z" })], CURSO);
    expect(l.entrega_estado).toBe("TURNED_IN");
  });
  it("descrição longa é limitada, links não https e ids inválidos são descartados", () => {
    const l = normalizarAtividade(atividade("6", { descricao: "x".repeat(5000), link: "javascript:alert(1)", anexos: [{ tipo: "drive", nome: "a.pdf", link: "http://inseguro" }, { tipo: "link", nome: "b", link: "https://ok.example" }] }), undefined, CURSO)!;
    expect(l.descricao).toHaveLength(2000);
    expect(l.link).toBeNull();
    expect(l.anexos.map((a) => a.link)).toEqual([null, "https://ok.example/"]);
    expect(normalizarAtividade(atividade("../x"), undefined, CURSO)).toBeNull();
    expect(linkSeguro("https://classroom.google.com/c/1")).toBe("https://classroom.google.com/c/1");
  });
});

describe("comparação de snapshot", () => {
  const base = normalizarAtividade(atividade("1"), entrega("1", "NEW"), CURSO)!;
  it("repetir a mesma leitura não muda nada (idempotente)", () => {
    expect(compararSnapshot({ ...base, pontuacao_maxima: "100" as unknown as number, prazo_em: "2026-10-22 02:59:00+00" }, base)).toEqual({ mudancas: [], mudouAlgo: false });
    // jsonb devolve as chaves dos anexos em outra ordem: não é mudança.
    const comAnexo = normalizarAtividade(atividade("1", { anexos: [{ tipo: "drive", id: "f", nome: "a.pdf", link: "https://d.example/f", possivel_pdf: true }] }), entrega("1", "NEW"), CURSO)!;
    const doBanco = { ...comAnexo, anexos: [{ id: "f", link: "https://d.example/f", nome: "a.pdf", tipo: "drive", possivel_pdf: true }] };
    expect(compararSnapshot(doBanco, comAnexo)).toEqual({ mudancas: [], mudouAlgo: false });
  });
  it("detecta prazo alterado, entrega confirmada e nota lançada", () => {
    const novo = normalizarAtividade(atividade("1", { prazo: { em_utc: "2026-10-29T02:59:00+00:00", precisao: "instante", situacao_temporal: "futuro" } }), entrega("1", "TURNED_IN", { nota_atribuida: 9 }), CURSO)!;
    expect(compararSnapshot(base, novo).mudancas).toEqual(["prazo", "entrega", "nota"]);
  });
});

describe("agenda", () => {
  const base = { id: "uuid-1", titulo: "Atividade de exemplo", disciplina: "Nuvem", entregaAtrasada: null, ausente: false };
  const p = { precisao: "instante" as const, em: "2026-10-22T02:59:00Z", data: null };
  it("pendente com prazo vira prazo na data/hora local, com lembretes", () => {
    expect(classroomParaEvento({ ...base, prazo: p, entregaEstado: "NEW" }, ANTES)).toMatchObject({ id: "classroom-uuid-1", tipo: "prazo", data: "2026-10-21", inicio: "23:59", titulo: "Classroom: Atividade de exemplo (Nuvem)", lembretesAntes: [3, 1] });
  });
  it("entregue, devolvida, sem prazo e ausente não viram vencimento; só data fica sem hora; não confirmada avisa", () => {
    expect(classroomParaEvento({ ...base, prazo: p, entregaEstado: "TURNED_IN" }, ANTES)).toBeNull();
    expect(classroomParaEvento({ ...base, prazo: p, entregaEstado: "RETURNED" }, ANTES)).toBeNull();
    expect(classroomParaEvento({ ...base, prazo: { precisao: "sem_prazo", em: null, data: null }, entregaEstado: "NEW" }, ANTES)).toBeNull();
    expect(classroomParaEvento({ ...base, prazo: p, entregaEstado: "NEW", ausente: true }, ANTES)).toBeNull();
    expect(classroomParaEvento({ ...base, prazo: { precisao: "somente_data_utc", em: null, data: "2026-11-05" }, entregaEstado: "NEW" }, ANTES)).toMatchObject({ data: "2026-11-05", inicio: null });
    expect(classroomParaEvento({ ...base, prazo: p, entregaEstado: null }, ANTES)!.titulo).toContain("entrega não confirmada");
  });
});

describe("painel", () => {
  const linha = (id: string, estado: AtividadeClassroom["entrega_estado"], prazoEm: string | null, curso = CURSO): AtividadeClassroom => ({
    ...(normalizarAtividade(atividade(id, prazoEm ? { prazo: { em_utc: prazoEm, precisao: "instante", situacao_temporal: "futuro" } } : { prazo: { em_utc: null, precisao: null, situacao_temporal: "sem_prazo" } }, curso), estado ? entrega(id, estado, {}, curso) : undefined, curso)!),
    id, visto_em: "2026-10-20T00:00:00Z", ausente_desde: null, mudou_em: null, mudancas: [], prazo_anterior: null,
    status_pessoal: "a_fazer", prioridade: 0, notas_pessoais: null, inicio_planejado: null, avaliacao_id: null,
    resolucao_local: null, resolvida_em: null, revisar_desde: null,
  } as AtividadeClassroom);
  const lista = [
    linha("p1", "NEW", "2026-10-24T02:59:00Z"), linha("p2", "CREATED", null), linha("a1", "NEW", "2026-10-19T02:59:00Z"),
    linha("e1", "TURNED_IN", "2026-10-19T02:59:00Z"), linha("d1", "RETURNED", "2026-10-10T02:59:00Z"), linha("u1", null, "2026-10-25T02:59:00Z"),
  ];
  it("indicadores não contam entregues como pendência nem inventam números", () => {
    expect(indicadores(lista, ANTES)).toEqual({ pendentes: 2, atrasadas: 1, entregues: 1, devolvidas: 1, naoConfirmadas: 1, proximas7: 2, concluidasLocal: 0, dispensadas: 0, revisar: 0 });
    expect(indicadores([], ANTES)).toEqual({ pendentes: 0, atrasadas: 0, entregues: 0, devolvidas: 0, naoConfirmadas: 0, proximas7: 0, concluidasLocal: 0, dispensadas: 0, revisar: 0 });
    // Resolvidas saem de pendentes/atrasadas e entram nos próprios contadores.
    const resolvidas = lista.map((a) => (a.id === "p1" ? { ...a, resolucao_local: "concluida" as const } : a.id === "a1" ? { ...a, resolucao_local: "dispensada" as const, revisar_desde: "2026-10-20T00:00:00Z" } : a));
    expect(indicadores(resolvidas, ANTES)).toMatchObject({ pendentes: 1, atrasadas: 0, concluidasLocal: 1, dispensadas: 1, revisar: 1, proximas7: 1 });
    const f = { rapido: "concluidas_local" as const, curso: "todos" as const, busca: "", prazo: "todos" as const, de: null, ate: null };
    expect(filtrar(resolvidas, f, ANTES).map((a) => a.id)).toEqual(["p1"]);
    expect(filtrar(resolvidas, { ...f, rapido: "revisar" }, ANTES).map((a) => a.id)).toEqual(["a1"]);
    expect(filtrar(resolvidas, { ...f, rapido: "para_entregar" }, ANTES).map((a) => a.id)).toEqual(["p2"]);
  });
  it("filtros rápidos, prazo, período e busca", () => {
    const f = { rapido: "todas" as const, curso: "todos" as const, busca: "", prazo: "todos" as const, de: null, ate: null };
    const ids = (x: AtividadeClassroom[]) => x.map((a) => a.id);
    expect(ids(filtrar(lista, { ...f, rapido: "para_entregar" }, ANTES))).toEqual(["p1", "p2", "a1"]);
    expect(ids(filtrar(lista, { ...f, rapido: "vencidas" }, ANTES))).toEqual(["a1"]);
    expect(ids(filtrar(lista, { ...f, rapido: "proximos7" }, ANTES))).toEqual(["p1", "u1"]);
    expect(ids(filtrar(lista, { ...f, prazo: "sem" }, ANTES))).toEqual(["p2"]);
    expect(ids(filtrar(lista, { ...f, de: "2026-10-20", ate: "2026-10-31" }, ANTES))).toEqual(["p1", "u1"]);
    expect(ids(filtrar(lista, { ...f, busca: "atividade d1" }, ANTES))).toEqual(["d1"]);
  });
});

describe("decisão pessoal (só no AgendaJeff)", () => {
  const p = { precisao: "instante" as const, em: "2026-10-22T02:59:00Z", data: null };
  const base = { id: "uuid-2", titulo: "Leitura", disciplina: "Nuvem", entregaAtrasada: null, ausente: false, prazo: p };
  it("concluída aqui e dispensada valem sobre pendente, atrasada, não confirmada e devolvida; entregue no Classroom prevalece", () => {
    for (const estado of ["NEW", "CREATED", "RECLAIMED_BY_STUDENT", "RETURNED", null] as const) {
      expect(situacaoEfetiva({ prazo: p, entregaEstado: estado, entregaAtrasada: null, resolucaoLocal: "concluida" }, DEPOIS)).toBe("concluida_local");
      expect(situacaoEfetiva({ prazo: p, entregaEstado: estado, entregaAtrasada: null, resolucaoLocal: "dispensada" }, DEPOIS)).toBe("dispensada");
    }
    expect(situacaoEfetiva({ prazo: p, entregaEstado: "TURNED_IN", entregaAtrasada: null, resolucaoLocal: "dispensada" }, DEPOIS)).toBe("entregue");
    // Sem decisão (ou reaberta), volta o estado oficial calculado na hora.
    expect(situacaoEfetiva({ prazo: p, entregaEstado: "NEW", entregaAtrasada: null, resolucaoLocal: null }, DEPOIS)).toBe("atrasada");
    expect(situacaoEfetiva({ prazo: p, entregaEstado: "NEW", entregaAtrasada: null, resolucaoLocal: null }, ANTES)).toBe("pendente");
  });
  it("resolvida não vira prazo na agenda nem lembrete; reaberta volta", () => {
    expect(classroomParaEvento({ ...base, entregaEstado: "NEW", resolucaoLocal: "concluida" }, ANTES)).toBeNull();
    expect(classroomParaEvento({ ...base, entregaEstado: null, resolucaoLocal: "dispensada" }, ANTES)).toBeNull();
    expect(classroomParaEvento({ ...base, entregaEstado: "NEW", resolucaoLocal: null }, ANTES)).not.toBeNull();
  });
});

describe("entregas da semana", () => {
  // "Agora": terça 20/10/2026, 12h em São Paulo.
  const AGORA = new Date("2026-10-20T15:00:00Z");
  const linha = (id: string, estado: AtividadeClassroom["entrega_estado"], prazoEm: string | null, extra: Partial<AtividadeClassroom> = {}): AtividadeClassroom => ({
    ...(normalizarAtividade(atividade(id, prazoEm ? { prazo: { em_utc: prazoEm, precisao: "instante", situacao_temporal: "futuro" } } : { prazo: { em_utc: null, precisao: null, situacao_temporal: "sem_prazo" } }), estado ? entrega(id, estado) : undefined, CURSO)!),
    id, visto_em: "2026-10-20T00:00:00Z", ausente_desde: null, mudou_em: null, mudancas: [], prazo_anterior: null,
    status_pessoal: "a_fazer", prioridade: 0, notas_pessoais: null, inicio_planejado: null, avaliacao_id: null,
    resolucao_local: null, resolvida_em: null, revisar_desde: null, ...extra,
  } as AtividadeClassroom);
  it("atrasadas primeiro, depois hoje, amanhã e os próximos 7 dias; fora da janela, sem prazo, entregues e resolvidas ficam de fora", () => {
    const atividades = [
      linha("hoje", "NEW", "2026-10-21T02:59:00Z"),          // 20/10 23h59
      linha("amanha", "CREATED", "2026-10-21T22:00:00Z"),    // 21/10 19h
      linha("seis-dias", "NEW", "2026-10-26T22:00:00Z"),     // 26/10 (dentro dos 7 dias)
      linha("sete-dias", "NEW", "2026-10-27T22:00:00Z"),     // 27/10 (fora)
      linha("atrasada", "NEW", "2026-10-10T22:00:00Z"),      // muito atrás: atrasada continua
      linha("entregue", "TURNED_IN", "2026-10-22T22:00:00Z"),
      linha("devolvida", "RETURNED", "2026-10-22T22:00:00Z"),
      linha("sem-prazo", "NEW", null),
      linha("concluida-aqui", "NEW", "2026-10-22T22:00:00Z", { resolucao_local: "concluida" }),
      linha("nao-confirmada", null, "2026-10-23T22:00:00Z"),
    ];
    const avaliacoes = [
      { id: "trab", disciplina_id: "d1", tipo: "trabalho", titulo: "Trabalho cadastrado", data: "2026-10-22", hora: "19:00:00", entregue: false },
      { id: "prova", disciplina_id: "d1", tipo: "prova", titulo: "Prova", data: "2026-10-22", entregue: false },
      { id: "feito", disciplina_id: "d1", tipo: "atividade", titulo: "Feita", data: "2026-10-22", entregue: true },
      { id: "vinc", disciplina_id: "d1", tipo: "trabalho", titulo: "Vinculada", data: "2026-10-22", entregue: false },
    ];
    atividades[1].avaliacao_id = "vinc";
    const r = entregasDaSemana(atividades, avaliacoes, AGORA);
    expect(r.map((e) => [e.titulo.replace("Atividade ", ""), e.urgencia])).toEqual([
      ["atrasada", "atrasada"], ["hoje", "hoje"], ["amanha", "amanha"], ["Trabalho cadastrado", "proxima"], ["nao-confirmada", "proxima"], ["seis-dias", "proxima"],
    ]);
    expect(r.find((e) => e.titulo === "Trabalho cadastrado")).toMatchObject({ origem: "faculdade", hora: "19:00", dias: 2 });
    expect(r.find((e) => e.titulo.endsWith("nao-confirmada"))!.naoConfirmada).toBe(true);
    expect(r.find((e) => e.titulo.endsWith("atrasada"))!.dias).toBe(-10);
  });
});
