-- Schema inicial do Montador de Cadeia de Hábito.
-- Toda tabela tem user_id e RLS restrita a auth.uid(). Datas de check são datas locais de America/Sao_Paulo.

create type periodo as enum ('manha', 'tarde', 'noite', 'livre');
create type status_check as enum ('completo', 'minimo', 'nao_feito', 'nao_se_aplica');
create type tipo_evento as enum ('compromisso', 'excecao_rotina', 'prazo');
create type status_freela as enum ('proposta', 'em_andamento', 'entregue', 'pago', 'cancelado');
create type contexto_flex as enum ('dia_util_sem_aula', 'fim_de_semana');

create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  nome text,
  fuso text not null default 'America/Sao_Paulo',
  dias_de_aula smallint[] not null default '{1,2,3,4,5}',
  rotina jsonb,
  semestre_inicio date,
  semestre_fim date,
  inicio_rastreamento date,
  criado_em timestamptz not null default now()
);

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  slug text not null,
  nome text not null,
  somente_domingo boolean not null default false,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (user_id, slug)
);

create table chains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  slug text not null,
  nome text not null,
  ancora text not null,
  dias_semana smallint[] not null,
  depende_aula boolean not null default false,
  periodo periodo not null default 'livre',
  janela_inicio time,
  janela_fim time,
  nao_antes time,
  lembrete boolean not null default true,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (user_id, slug)
);

create table chain_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  chain_id uuid not null references chains on delete cascade,
  habit_id uuid not null references habits on delete cascade,
  posicao integer not null,
  gatilho text not null,
  minimo text,
  completo text,
  nao_antes time,
  constraint chain_steps_posicao_unica unique (chain_id, posicao) deferrable initially deferred,
  unique (chain_id, habit_id)
);

create table checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  habit_id uuid not null references habits on delete cascade,
  chain_id uuid references chains on delete set null,
  data_local date not null,
  status status_check not null,
  nota text,
  registrado_em timestamptz not null default now(),
  unique (user_id, habit_id, data_local)
);

create table daily_flex_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  contexto contexto_flex not null,
  habit_id uuid not null references habits on delete cascade,
  posicao integer not null default 0,
  unique (user_id, contexto, habit_id)
);

create table freelas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  cliente text not null,
  titulo text not null,
  descricao text,
  status status_freela not null default 'proposta',
  prazo date,
  valor numeric(12, 2),
  horas_estimadas numeric(7, 2),
  repositorio_url text,
  portfolio_registrado boolean not null default false,
  criado_em timestamptz not null default now()
);

create table freela_time_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  freela_id uuid not null references freelas on delete cascade,
  data_local date not null,
  horas numeric(5, 2) not null check (horas > 0),
  nota text,
  criado_em timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  slug text,
  tipo tipo_evento not null,
  titulo text not null,
  descricao text,
  data date,
  inicio time,
  fim time,
  local text,
  recorrencia text check (recorrencia is null or recorrencia ~ '^mensal:[0-9]{1,2}$'),
  lembretes_dias smallint[] not null default '{}',
  lembretes_a_partir_de date,
  efeito jsonb,
  observacao text,
  freela_id uuid references freelas on delete cascade,
  criado_em timestamptz not null default now(),
  check (data is not null or recorrencia is not null),
  unique (user_id, slug)
);

create table feriados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  nome text not null,
  ativo boolean not null default true,
  unique (user_id, data)
);

create table reminder_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  hora time not null,
  dias_semana smallint[] not null default '{0,1,2,3,4,5,6}',
  ativo boolean not null default true,
  unique (user_id, hora)
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  rotulo text not null,
  user_agent text,
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz
);

create table notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  tipo text not null check (tipo in ('agendado', 'teste')),
  slot_hora time,
  data_local date not null,
  subscription_id uuid references push_subscriptions on delete set null,
  status text not null check (status in ('enviado', 'erro', 'sem_pendencias', 'sem_aparelho')),
  titulo text,
  corpo text,
  erro text,
  criado_em timestamptz not null default now()
);
-- Um disparo agendado por usuário, horário e dia (evita duplicar se o cron rodar de novo).
create unique index notification_log_agendado_unico
  on notification_log (user_id, slot_hora, data_local, coalesce(subscription_id, '00000000-0000-0000-0000-000000000000'))
  where tipo = 'agendado';

create table pendencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  texto text not null,
  resolvida boolean not null default false,
  criado_em timestamptz not null default now()
);

create index on checks (user_id, data_local);
create index on events (user_id, data);
create index on chain_steps (chain_id, posicao);
create index on freela_time_logs (freela_id);

-- RLS: cada usuário só enxerga e altera as próprias linhas.
do $$
declare t text;
begin
  foreach t in array array['profiles','habits','chains','chain_steps','checks','daily_flex_rules','freelas',
    'freela_time_logs','events','feriados','reminder_slots','push_subscriptions','notification_log','pendencias']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "dono" on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- O log é escrito só pela Edge Function (service role); o usuário apenas lê.
drop policy "dono" on notification_log;
create policy "dono le" on notification_log for select to authenticated using (user_id = (select auth.uid()));

-- Referências cruzadas também precisam ser do mesmo usuário.
create or replace function public.mesmo_dono() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'chain_steps' then
    if not exists (select 1 from public.chains c where c.id = new.chain_id and c.user_id = new.user_id)
       or not exists (select 1 from public.habits h where h.id = new.habit_id and h.user_id = new.user_id) then
      raise exception 'Cadeia ou hábito de outro usuário';
    end if;
  elsif tg_table_name in ('checks', 'daily_flex_rules') then
    if not exists (select 1 from public.habits h where h.id = new.habit_id and h.user_id = new.user_id) then
      raise exception 'Hábito de outro usuário';
    end if;
  elsif tg_table_name = 'freela_time_logs' then
    if not exists (select 1 from public.freelas f where f.id = new.freela_id and f.user_id = new.user_id) then
      raise exception 'Freela de outro usuário';
    end if;
  end if;
  return new;
end $$;
create trigger mesmo_dono before insert or update on chain_steps for each row execute function public.mesmo_dono();
create trigger mesmo_dono before insert or update on checks for each row execute function public.mesmo_dono();
create trigger mesmo_dono before insert or update on daily_flex_rules for each row execute function public.mesmo_dono();
create trigger mesmo_dono before insert or update on freela_time_logs for each row execute function public.mesmo_dono();

-- Perfil criado no cadastro.
create or replace function public.criar_perfil() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger criar_perfil after insert on auth.users for each row execute function public.criar_perfil();

-- Reordena passos numa transação (a unicidade de posição é verificada só no fim).
create or replace function public.reordenar_passos(p_chain uuid, p_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.chain_steps s set posicao = x.ord
  from unnest(p_ids) with ordinality as x(id, ord)
  where s.id = x.id and s.chain_id = p_chain;
end $$;
