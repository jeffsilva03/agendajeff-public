-- API de integração (somente leitura) e acesso de clientes OAuth (ex.: ChatGPT via MCP).
-- Aditiva: não remove nem altera dados existentes.
--
-- Tokens emitidos pelo servidor OAuth do Supabase para um cliente externo trazem a claim `client_id`.
-- Sessões do próprio app não trazem. As políticas RESTRICTIVE abaixo usam isso para que um cliente
-- externo só consiga LER, e nunca as tabelas internas (perfil com o token do calendário, aparelhos de push…).

-- 1. Interruptor do usuário: integrações externas começam desligadas.
alter table profiles add column if not exists integracoes_ativas boolean not null default false;

-- 2. Clientes OAuth: nada de gravar em nenhuma tabela do app.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('create policy "oauth nao grava (insert)" on %I as restrictive for insert to authenticated with check ((select auth.jwt() ->> ''client_id'') is null)', t);
    execute format('create policy "oauth nao grava (update)" on %I as restrictive for update to authenticated using ((select auth.jwt() ->> ''client_id'') is null) with check ((select auth.jwt() ->> ''client_id'') is null)', t);
    execute format('create policy "oauth nao grava (delete)" on %I as restrictive for delete to authenticated using ((select auth.jwt() ->> ''client_id'') is null)', t);
  end loop;
end $$;

-- 3. Tabelas internas: clientes OAuth também não leem (o perfil chega à API só pelos campos de api_perfil()).
do $$
declare t text;
begin
  foreach t in array array['profiles', 'push_subscriptions', 'notification_log', 'reminder_slots', 'pendencias'] loop
    execute format('create policy "oauth nao le tabela interna" on %I as restrictive for select to authenticated using ((select auth.jwt() ->> ''client_id'') is null)', t);
  end loop;
end $$;

-- 4. Uso da API: contagem por minuto (limite de abuso) e último uso por cliente (mostrado em Ajustes).
create table api_uso_minuto (
  user_id uuid not null references auth.users on delete cascade,
  cliente text not null, -- client_id do OAuth, ou 'app' para a sessão do próprio app
  minuto timestamptz not null,
  contagem integer not null default 0,
  primary key (user_id, cliente, minuto)
);
create table api_clientes_uso (
  user_id uuid not null references auth.users on delete cascade,
  cliente text not null,
  primeiro_uso timestamptz not null default now(),
  ultimo_uso timestamptz not null default now(),
  total bigint not null default 0,
  primary key (user_id, cliente)
);
alter table api_uso_minuto enable row level security;
alter table api_clientes_uso enable row level security;
-- Leitura do próprio uso pela sessão do app; gravação só pela função abaixo.
create policy "dono le" on api_clientes_uso for select to authenticated
  using (user_id = (select auth.uid()) and (select auth.jwt() ->> 'client_id') is null);

-- Registra uma chamada do usuário autenticado e diz se ainda está dentro do limite (60 por minuto,
-- por usuário e cliente). A identidade vem só do JWT validado (auth.uid() e client_id), nunca de parâmetro.
create or replace function public.api_registrar_uso() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_cliente text := coalesce(auth.jwt() ->> 'client_id', 'app');
  v_minuto timestamptz := date_trunc('minute', now());
  v_limite constant integer := 60;
  v_contagem integer;
begin
  if v_user is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  insert into public.api_uso_minuto as u (user_id, cliente, minuto, contagem)
  values (v_user, v_cliente, v_minuto, 1)
  on conflict (user_id, cliente, minuto) do update set contagem = u.contagem + 1
  returning contagem into v_contagem;
  insert into public.api_clientes_uso as c (user_id, cliente, total)
  values (v_user, v_cliente, 1)
  on conflict (user_id, cliente) do update set ultimo_uso = now(), total = c.total + 1;
  delete from public.api_uso_minuto where user_id = v_user and minuto < now() - interval '1 day';
  return jsonb_build_object(
    'permitido', v_contagem <= v_limite,
    'limite', v_limite,
    'restante', greatest(v_limite - v_contagem, 0),
    'reinicia_em', v_minuto + interval '1 minute'
  );
end $$;
revoke execute on function public.api_registrar_uso() from public, anon;
grant execute on function public.api_registrar_uso() to authenticated;

-- 5. Campos do perfil que a API usa (sem token do calendário, nome ou rotina).
create or replace function public.api_perfil()
returns table (dias_de_aula smallint[], inicio_rastreamento date, foco_habito_id uuid, foco_semana date, integracoes_ativas boolean)
language sql stable security definer set search_path = '' as $$
  select p.dias_de_aula, p.inicio_rastreamento, p.foco_habito_id, p.foco_semana, p.integracoes_ativas
  from public.profiles p where p.user_id = auth.uid();
$$;
revoke execute on function public.api_perfil() from public, anon;
grant execute on function public.api_perfil() to authenticated;
