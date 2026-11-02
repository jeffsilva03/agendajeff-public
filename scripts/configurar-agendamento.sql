-- Configura (ou atualiza) a URL e o segredo usados pelo pg_cron para chamar os lembretes.
-- Local: npm run agendamento:local  |  Nuvem: rodar no SQL Editor trocando os valores.
-- :'url' e :'segredo' são variáveis do psql.
delete from vault.secrets where name in ('url_lembretes', 'segredo_cron');
select vault.create_secret(:'url', 'url_lembretes');
select vault.create_secret(:'segredo', 'segredo_cron');
