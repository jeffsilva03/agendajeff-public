// O carregamento vive em supabase/functions/_shared para ser o mesmo no app e nas Edge Functions.
export { carregarContexto, carregarChecks, carregarTarefas, linhaParaRecorrencia, type ContextoCompleto, type PerfilContexto, type Tarefa } from "../supabase/functions/_shared/carregar.ts";
