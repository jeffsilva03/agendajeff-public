-- Classroom: decisão pessoal sobre uma atividade, sem tocar no Google Classroom.
-- Aditiva: só colunas novas (nulas) em classroom_atividades; os dados já sincronizados não mudam.
alter table classroom_atividades
  add column if not exists resolucao_local text check (resolucao_local in ('concluida', 'dispensada')),
  add column if not exists resolvida_em timestamptz,
  -- O professor mudou algo relevante (prazo, entrega, nota, título...) depois da decisão: pedir revisão sem desfazer nada.
  add column if not exists revisar_desde timestamptz;

-- Mesmo regime dos outros campos pessoais: o dono altera só estas colunas (a sincronização nunca as escreve).
grant update (resolucao_local, resolvida_em, revisar_desde) on classroom_atividades to authenticated;
