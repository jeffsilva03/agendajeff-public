// Conversão das respostas do APIClassroom para as linhas do banco e comparação com o snapshot anterior.
// Funções puras (testadas em tests/api/classroom.test.ts).
import type { EstadoEntregaClassroom, PrecisaoPrazo } from "@motor";
import type { AnexoApi, AtividadeApi, EntregaApi, LinhaOficial } from "./tipos";

const ESTADOS: EstadoEntregaClassroom[] = ["NEW", "CREATED", "TURNED_IN", "RETURNED", "RECLAIMED_BY_STUDENT"];
const PRECISOES: PrecisaoPrazo[] = ["instante", "somente_data_utc", "incompleto", "sem_prazo"];
const ID = /^[A-Za-z0-9_-]{1,180}$/;

/** Só links https (o conteúdo do Classroom é dado não confiável: nada de javascript: ou http solto). */
export const linkSeguro = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch { return null; }
};
const texto = (v: unknown, max: number): string | null => (typeof v === "string" ? v.slice(0, max) : null);
const instante = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function prazo(p: AtividadeApi["prazo"] | undefined): Pick<LinhaOficial, "prazo_em" | "prazo_data" | "prazo_precisao"> {
  const precisao = p && PRECISOES.includes(p.precisao as PrecisaoPrazo) ? (p.precisao as PrecisaoPrazo) : p?.situacao_temporal === "sem_prazo" ? "sem_prazo" : "incompleto";
  if (precisao === "instante") {
    const em = instante(p?.em_utc);
    return em ? { prazo_em: em, prazo_data: null, prazo_precisao: "instante" } : { prazo_em: null, prazo_data: null, prazo_precisao: "incompleto" };
  }
  if (precisao === "somente_data_utc") {
    const d = typeof p?.data_utc === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.data_utc) ? p.data_utc : null;
    return d ? { prazo_em: null, prazo_data: d, prazo_precisao: "somente_data_utc" } : { prazo_em: null, prazo_data: null, prazo_precisao: "incompleto" };
  }
  return { prazo_em: null, prazo_data: null, prazo_precisao: precisao };
}

const anexos = (l: unknown): AnexoApi[] => (Array.isArray(l) ? l.slice(0, 30) : []).map((a: AnexoApi) => ({
  tipo: texto(a?.tipo, 40) ?? "outro", id: texto(a?.id, 200), nome: texto(a?.nome, 300), link: linkSeguro(a?.link), possivel_pdf: a?.possivel_pdf === true,
}));

/** Atividade + a submissão própria correspondente (ou nenhuma) → linha oficial. Devolve null se os ids não forem válidos. */
export function normalizarAtividade(a: AtividadeApi, entrega: EntregaApi | undefined, courseId: string): LinhaOficial | null {
  if (!a || typeof a.id !== "string" || !ID.test(a.id) || a.disciplina_id !== courseId) return null;
  const estado = entrega && ESTADOS.includes(entrega.estado as EstadoEntregaClassroom) ? (entrega.estado as EstadoEntregaClassroom) : null;
  return {
    course_id: courseId, activity_id: a.id,
    titulo: texto(a.titulo, 500) || "(sem título)", descricao: texto(a.descricao, 2000), descricao_truncada: a.descricao_truncada === true,
    tipo: texto(a.tipo, 60), link: linkSeguro(a.link), anexos: anexos(a.anexos), estado_publicacao: texto(a.estado_publicacao, 40),
    pontuacao_maxima: numero(a.pontuacao_maxima), ...prazo(a.prazo),
    criado_origem: instante(a.criado_em), atualizado_origem: instante(a.atualizado_em),
    entrega_id: entrega && typeof entrega.id === "string" ? entrega.id.slice(0, 200) : null,
    entrega_estado: estado,
    entrega_atrasada: typeof entrega?.atrasada_segundo_google === "boolean" ? entrega.atrasada_segundo_google : null,
    nota: numero(entrega?.nota_atribuida), // 0 é nota; null é "sem nota"
    entrega_atualizada_origem: instante(entrega?.atualizado_em), entrega_link: linkSeguro(entrega?.link),
  };
}

/** Junta atividades e submissões por (course_id, activity_id), sem chamada por atividade. A mais recente vence se vier repetida. */
export function juntarPorAtividade(atividades: AtividadeApi[], entregas: EntregaApi[], courseId: string): LinhaOficial[] {
  const porAtividade = new Map<string, EntregaApi>();
  for (const e of entregas) {
    if (!e || e.disciplina_id !== courseId || !e.atividade_id) continue;
    const atual = porAtividade.get(e.atividade_id);
    if (!atual || (e.atualizado_em ?? "") > (atual.atualizado_em ?? "")) porAtividade.set(e.atividade_id, e);
  }
  const unicas = new Map<string, LinhaOficial>();
  for (const a of atividades) {
    const l = normalizarAtividade(a, porAtividade.get(a?.id), courseId);
    if (l) unicas.set(l.activity_id, l);
  }
  return [...unicas.values()];
}

export type Mudanca = "titulo" | "descricao" | "prazo" | "entrega" | "nota" | "anexos";

/** JSON com as chaves em ordem: o jsonb do Postgres reordena as chaves ao guardar. */
const estavel = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(estavel).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${estavel((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
};
const igual = (a: unknown, b: unknown) => estavel(a) === estavel(b);
const mesmoInstante = (a: string | null, b: string | null) => (a && b ? Date.parse(a) === Date.parse(b) : a === b);

/** O que mudou entre o snapshot guardado e o novo (só campos oficiais). Lista vazia: nada a gravar. */
export function compararSnapshot(antes: Partial<LinhaOficial>, depois: LinhaOficial): { mudancas: Mudanca[]; mudouAlgo: boolean } {
  const mudancas: Mudanca[] = [];
  if (antes.titulo !== depois.titulo) mudancas.push("titulo");
  if ((antes.descricao ?? null) !== depois.descricao) mudancas.push("descricao");
  if (antes.prazo_precisao !== depois.prazo_precisao || !mesmoInstante(antes.prazo_em ?? null, depois.prazo_em) || (antes.prazo_data ?? null) !== depois.prazo_data) mudancas.push("prazo");
  if ((antes.entrega_estado ?? null) !== depois.entrega_estado) mudancas.push("entrega");
  if ((antes.nota ?? null) === null ? depois.nota !== null : Number(antes.nota) !== depois.nota) mudancas.push("nota");
  if (!igual(antes.anexos, depois.anexos)) mudancas.push("anexos");
  // Outros campos (link, tipo, atraso, datas de origem) também atualizam o registro, mas não contam como "mudança" para o usuário.
  const chaves: (keyof LinhaOficial)[] = ["descricao_truncada", "tipo", "link", "estado_publicacao", "pontuacao_maxima", "criado_origem", "atualizado_origem", "entrega_id", "entrega_atrasada", "entrega_atualizada_origem", "entrega_link"];
  const outros = chaves.some((k) => (k.endsWith("_origem") ? !mesmoInstante((antes[k] as string) ?? null, depois[k] as string | null) : !igual(k === "pontuacao_maxima" && antes[k] != null ? Number(antes[k]) : antes[k], depois[k])));
  return { mudancas, mudouAlgo: mudancas.length > 0 || outros };
}
