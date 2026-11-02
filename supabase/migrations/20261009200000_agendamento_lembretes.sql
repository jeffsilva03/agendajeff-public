-- Agendamento dos lembretes: pg_cron chama a Edge Function "lembretes" a cada 5 minutos.
-- A URL e o segredo ficam no Vault (valores diferentes no local e na nuvem):
--   select vault.create_secret('<url>/functions/v1/lembretes', 'url_lembretes');
--   select vault.create_secret('<CRON_SECRET>', 'segredo_cron');
-- Ver scripts/configurar-agendamento.sql.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.disparar_lembretes() returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'url_lembretes');
  v_segredo text := (select decrypted_secret from vault.decrypted_secrets where name = 'segredo_cron');
begin
  if v_url is null or v_segredo is null then
    raise warning 'Agendamento sem configuração: faltam url_lembretes/segredo_cron no Vault';
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;
revoke execute on function public.disparar_lembretes() from public, anon, authenticated;

select cron.schedule('lembretes', '*/5 * * * *', 'select public.disparar_lembretes()');
