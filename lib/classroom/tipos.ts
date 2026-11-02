// Contratos do APIClassroom (conferidos no código: classroom_app/activities.py e courses.py, commit 6c4ebe6).
// Só os campos usados aqui; o resto da resposta é ignorado.
import type { EstadoEntregaClassroom, PrecisaoPrazo } from "@motor";

export interface TurmaApi {
  id: string; nome: string; status: string | null; aliases: string[]; link: string | null; descricao?: string; atualizado_em: string | null;
}
export interface RespostaTurmas { disciplinas: TurmaApi[]; proxima_pagina: string | null }

export interface AnexoApi { tipo: string; id?: string | null; nome?: string | null; link?: string | null; possivel_pdf?: boolean }
export interface PrazoApi {
  em_utc: string | null; em_sao_paulo?: string | null; precisao: PrecisaoPrazo | null; situacao_temporal: string; data_utc?: string;
}
export interface AtividadeApi {
  id: string; disciplina_id: string; disciplina_nome: string; titulo: string | null; descricao: string | null; descricao_truncada: boolean;
  tipo: string | null; estado_publicacao: string | null; criado_em: string | null; atualizado_em: string | null; link: string | null;
  anexos: AnexoApi[]; pontuacao_maxima: number | null; prazo: PrazoApi;
}
export interface RespostaAtividades { itens: AtividadeApi[]; proxima_pagina: string | null }
export interface RespostaDetalhe { atividade: AtividadeApi }

export interface EntregaApi {
  id: string; disciplina_id: string; atividade_id: string | null; estado: EstadoEntregaClassroom | string | null;
  atrasada_segundo_google: boolean | null; nota_atribuida: number | null; criado_em: string | null; atualizado_em: string | null; link: string | null;
}
export interface RespostaEntregas { entregas: EntregaApi[]; proxima_pagina: string | null }

export interface ErroApiClassroom { erro?: { codigo?: string; mensagem?: string } }

/** Linha oficial de classroom_atividades (só o que a sincronização escreve). */
export interface LinhaOficial {
  course_id: string; activity_id: string; titulo: string; descricao: string | null; descricao_truncada: boolean; tipo: string | null;
  link: string | null; anexos: AnexoApi[]; estado_publicacao: string | null; pontuacao_maxima: number | null;
  prazo_em: string | null; prazo_data: string | null; prazo_precisao: PrecisaoPrazo;
  criado_origem: string | null; atualizado_origem: string | null;
  entrega_id: string | null; entrega_estado: EstadoEntregaClassroom | null; entrega_atrasada: boolean | null; nota: number | null;
  entrega_atualizada_origem: string | null; entrega_link: string | null;
}
