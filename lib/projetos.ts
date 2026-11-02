// Projetos: rótulos, progresso pelas features e ordem da lista. Funções puras (testadas em tests/api/projetos.test.ts).

export type StatusProjeto = "ideia" | "planejando" | "desenvolvendo" | "pausado" | "concluido" | "arquivado";
export type PrioridadeProjeto = "baixa" | "media" | "alta";
export type CategoriaProjeto = "pessoal" | "portfolio" | "faculdade" | "negocio" | "estudo";
export type StatusFeature = "a_fazer" | "fazendo" | "feito";
export type PrioridadeFeature = "essencial" | "importante" | "extra";

export interface Feature {
  id: string; projeto_id: string; titulo: string; descricao: string | null;
  status: StatusFeature; prioridade: PrioridadeFeature; ordem: number; concluida_em: string | null;
}

export interface Projeto {
  id: string; nome: string; resumo: string | null; descricao: string | null; problema: string | null; publico: string | null;
  status: StatusProjeto; status_desde: string; prioridade: PrioridadeProjeto; categoria: CategoriaProjeto | null;
  tecnologias: string[]; repositorio_url: string | null; site_url: string | null; inicio: string | null; prazo: string | null;
  proximo_passo: string | null; notas: string | null; fixado: boolean; criado_em: string; atualizado_em: string;
}

/** Ordem do ciclo de vida; a cor de cada status vem dos tokens do tema. */
export const STATUS_PROJETO: Record<StatusProjeto, { rotulo: string; cor: string; dica: string }> = {
  ideia: { rotulo: "Ideia", cor: "var(--tag-fds)", dica: "Só a ideia anotada" },
  planejando: { rotulo: "Planejando", cor: "var(--tag-tarde)", dica: "Definindo escopo e features" },
  desenvolvendo: { rotulo: "Em desenvolvimento", cor: "var(--feito)", dica: "Mão na massa" },
  pausado: { rotulo: "Pausado", cor: "var(--aviso)", dica: "Parado por enquanto" },
  concluido: { rotulo: "Concluído", cor: "var(--tag-manha)", dica: "Entregue ou publicado" },
  arquivado: { rotulo: "Arquivado", cor: "var(--muted-foreground)", dica: "Descartado, fica só de registro" },
};
export const ORDEM_STATUS = Object.keys(STATUS_PROJETO) as StatusProjeto[];

export const PRIORIDADE_PROJETO: Record<PrioridadeProjeto, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
export const CATEGORIA_PROJETO: Record<CategoriaProjeto, string> = {
  pessoal: "Pessoal", portfolio: "Portfólio", faculdade: "Faculdade", negocio: "Negócio", estudo: "Estudo",
};
export const STATUS_FEATURE: Record<StatusFeature, string> = { a_fazer: "A fazer", fazendo: "Fazendo", feito: "Feito" };
export const PRIORIDADE_FEATURE: Record<PrioridadeFeature, { rotulo: string; dica: string }> = {
  essencial: { rotulo: "Essencial", dica: "Entra na primeira versão (MVP)" },
  importante: { rotulo: "Importante", dica: "Logo depois do MVP" },
  extra: { rotulo: "Extra", dica: "Se der tempo" },
};

/** Próximo status ao tocar no marcador da feature: a fazer → fazendo → feito → a fazer. */
export const proximoStatusFeature = (s: StatusFeature): StatusFeature => (s === "a_fazer" ? "fazendo" : s === "fazendo" ? "feito" : "a_fazer");

export interface ProgressoProjeto { feitas: number; total: number; pct: number | null; mvpFeitas: number; mvpTotal: number; mvpPct: number | null; fazendo: number }

export function progressoProjeto(features: Pick<Feature, "status" | "prioridade">[]): ProgressoProjeto {
  const feitas = features.filter((f) => f.status === "feito").length;
  const mvp = features.filter((f) => f.prioridade === "essencial");
  const mvpFeitas = mvp.filter((f) => f.status === "feito").length;
  return {
    feitas, total: features.length, pct: features.length ? feitas / features.length : null,
    mvpFeitas, mvpTotal: mvp.length, mvpPct: mvp.length ? mvpFeitas / mvp.length : null,
    fazendo: features.filter((f) => f.status === "fazendo").length,
  };
}

/** Grupos de filtro da tela. "Ativos" é o padrão: o que está andando ou parado, sem as ideias soltas. */
export const FILTROS = {
  ativos: { rotulo: "Ativos", status: ["planejando", "desenvolvendo", "pausado"] },
  ideias: { rotulo: "Ideias", status: ["ideia"] },
  concluidos: { rotulo: "Concluídos", status: ["concluido"] },
  arquivados: { rotulo: "Arquivados", status: ["arquivado"] },
  todos: { rotulo: "Todos", status: ORDEM_STATUS },
} satisfies Record<string, { rotulo: string; status: StatusProjeto[] }>;
export type Filtro = keyof typeof FILTROS;

const PESO_PRIORIDADE: Record<PrioridadeProjeto, number> = { alta: 0, media: 1, baixa: 2 };
const PESO_STATUS: Record<StatusProjeto, number> = { desenvolvendo: 0, planejando: 1, pausado: 2, ideia: 3, concluido: 4, arquivado: 5 };

/** Fixados primeiro; depois status (em desenvolvimento na frente), prioridade e o mexido por último. */
export function ordenarProjetos<T extends Pick<Projeto, "fixado" | "status" | "prioridade" | "atualizado_em">>(lista: T[]): T[] {
  return [...lista].sort((a, b) =>
    Number(b.fixado) - Number(a.fixado)
    || PESO_STATUS[a.status] - PESO_STATUS[b.status]
    || PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade]
    || b.atualizado_em.localeCompare(a.atualizado_em));
}

/** Features na ordem de trabalho: fazendo, a fazer (essenciais antes), feitas por último; dentro disso, a ordem manual. */
export function ordenarFeatures<T extends Pick<Feature, "status" | "prioridade" | "ordem">>(lista: T[]): T[] {
  const s: Record<StatusFeature, number> = { fazendo: 0, a_fazer: 1, feito: 2 };
  const p: Record<PrioridadeFeature, number> = { essencial: 0, importante: 1, extra: 2 };
  return [...lista].sort((a, b) => s[a.status] - s[b.status] || p[a.prioridade] - p[b.prioridade] || a.ordem - b.ordem);
}

/** Tecnologias digitadas separadas por vírgula, sem repetição (ignora maiúsculas) e sem vazios. */
export function lerTecnologias(texto: string): string[] {
  const vistos = new Set<string>();
  return texto.split(",").map((t) => t.trim()).filter((t) => t && !vistos.has(t.toLowerCase()) && vistos.add(t.toLowerCase())).slice(0, 15);
}

/** Há quanto tempo o projeto está no status atual: "Neste status desde hoje", "Neste status há 12 dias". */
export function desdeStatus(iso: string, hoje: string): string {
  const q = haQuanto(iso, hoje);
  return q === "hoje" || q === "ontem" ? `Neste status desde ${q}` : `Neste status ${q}`;
}

/** "há 3 dias", "hoje"… a partir de um instante ISO e da data local de hoje (AAAA-MM-DD). */
export function haQuanto(iso: string, hoje: string): string {
  const dias = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}
