// Textos da integração externa, mostrados no consentimento OAuth e em Ajustes.

/** O que um aplicativo autorizado consegue consultar (somente leitura). */
export const DADOS_COMPARTILHAVEIS = [
  "Agenda: compromissos, aulas, prazos e dias sem aula",
  "Tarefas do dia, atrasadas e recorrentes",
  "Faculdade: disciplinas, grade, faltas, provas, trabalhos, atividades, notas das avaliações e médias",
  "Atividades do Google Classroom sincronizadas e o estado das suas entregas",
  "Hábitos: o que vale em cada dia, registros, sequências e adesão",
  "Candidaturas e próximas etapas",
  "Freelas: status, prazos, valores e horas",
  "Projetos: status, descrição, features, próximo passo e links",
  "Mês: metas, Raio-X da vida e revisão mensal",
  "Insights e o planejamento da semana",
  "Suas anotações (dos registros, tarefas, candidaturas, freelas, avaliações e projetos)",
];

/** O que nunca é compartilhado com aplicativos externos. */
export const NUNCA_COMPARTILHADO = [
  "Alterar, criar ou apagar qualquer registro",
  "Senha, link do calendário, aparelhos de notificação e backups",
];

export const caminhosIntegracao = (origem: string) => ({
  mcp: `${origem}/mcp`,
  api: `${origem}/api/integrations/agenda/v1`,
});
