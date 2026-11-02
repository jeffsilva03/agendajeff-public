// Tipos do motor. Sem dependências de banco: o app e a Edge Function montam um
// Contexto a partir das tabelas e chamam as mesmas funções.

export type Periodo = "manha" | "tarde" | "noite" | "livre";
export type StatusCheck = "completo" | "minimo" | "nao_feito" | "nao_se_aplica";
export type TipoEvento = "compromisso" | "excecao_rotina" | "prazo";

export interface Habito {
  id: string;
  nome: string;
  somenteDomingo?: boolean;
}

export interface Passo {
  id: string;
  habitoId: string;
  posicao: number;
  gatilho: string;
  minimo: string | null;
  completo: string | null;
  naoAntes: string | null; // "HH:MM"
}

export interface Cadeia {
  id: string;
  nome: string;
  ancora: string;
  diasSemana: number[]; // 0 = domingo
  dependeAula: boolean;
  periodo: Periodo;
  janelaInicio: string | null; // "HH:MM"; janela pode cruzar a meia-noite
  janelaFim: string | null;
  naoAntes: string | null;
  lembrete: boolean; // false = nunca aparece em lembrete
  ordem: number;
  passos: Passo[];
}

export interface RegraFlex {
  contexto: "dia_util_sem_aula" | "fim_de_semana";
  habitoIds: string[];
}

export interface Evento {
  id: string;
  tipo: TipoEvento;
  titulo: string;
  data: string | null; // "AAAA-MM-DD"
  inicio: string | null;
  fim: string | null;
  local: string | null;
  recorrencia: string | null; // "mensal:10"
  lembretesDias: number[]; // dias do mês (prazo mensal)
  lembretesAntes?: number[]; // dias antes do prazo (prazo único, ex.: freela)
  lembretesAPartirDe: string | null;
  freelaId?: string | null;
  avaliacaoId?: string | null;
  classroomId?: string | null;
  efeito: { sem_aula?: boolean; com_aula?: boolean } | null;
}

export interface Feriado {
  data: string;
  nome: string;
  ativo: boolean;
}

/** Horário semanal de uma disciplina, válido entre o início e o fim do semestre. */
export interface AulaHorario {
  id: string;
  disciplinaId: string;
  disciplina: string;
  cor: string;
  sala: string | null;
  professor: string | null;
  diaSemana: number;
  inicio: string;
  fim: string;
  semestreInicio: string;
  semestreFim: string;
}

export interface Contexto {
  habitos: Habito[];
  cadeias: Cadeia[];
  regrasFlex: RegraFlex[];
  eventos: Evento[];
  feriados: Feriado[];
  diasDeAula: number[];
  aulas?: AulaHorario[];
}

export interface Check {
  habitoId: string;
  data: string;
  status: StatusCheck;
}

export interface AvisoColisao {
  cadeiaId: string;
  eventoId: string;
  texto: string;
}

export interface OcorrenciaPrazo {
  eventoId: string;
  titulo: string;
  data: string;
  tipo: "prazo" | "lembrete";
  dataPrazo: string;
}

export interface DiaResolvido {
  data: string;
  diaSemana: number;
  diaDeAula: boolean; // dia letivo pelo calendário semanal
  temAula: boolean; // depois de exceções e feriados
  motivoSemAula: string | null;
  cadeias: Cadeia[];
  flexiveis: Habito[];
  compromissos: Evento[];
  avisos: AvisoColisao[];
  prazos: OcorrenciaPrazo[]; // prazos e lembretes que caem neste dia
  aulas: AulaHorario[]; // aulas do cronograma neste dia (some em dia sem aula/feriado)
}
