-- Aplicativos autorizados pelo usuário podem consultar os dados da agenda:
-- clientes OAuth passam a ler também o Raio-X, a revisão mensal e as frases dos lembretes.
-- Continua valendo: OAuth não grava nada e não lê as tabelas internas (perfil com o token do
-- calendário, aparelhos de notificação, log de notificações, horários de lembrete e pendências).
do $$
declare t text;
begin
  foreach t in array array['raiox_meses', 'raiox_notas', 'revisoes_mensais', 'frases'] loop
    execute format('drop policy if exists "oauth nao le reflexao pessoal" on %I', t);
  end loop;
end $$;
