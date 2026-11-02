-- Planejamento semanal (foco da semana), candidaturas, tarefas recorrentes e sessões de foco.

-- Foco da semana: um hábito destacado no Hoje durante a semana escolhida (segunda-feira de referência).
alter table profiles
  add column foco_habito_id uuid references habits on delete set null,
  add column foco_semana date;

-- Tarefas recorrentes. Cada dia em que a regra vale gera uma tarefa "virtual" no Hoje;
-- ao concluir, vira uma linha em tarefas com recorrente_id (assim o histórico fica guardado).
create type regra_recorrencia as enum ('diaria', 'semanal', 'mensal');
create table tarefas_recorrentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  titulo text not null,
  regra regra_recorrencia not null,
  dias_semana smallint[] not null default '{}', -- semanal
  dia_mes smallint check (dia_mes between 1 and 31), -- mensal
  hora time,
  prioridade smallint not null default 0 check (prioridade in (0, 1)),
  inicio date not null default (now() at time zone 'America/Sao_Paulo')::date,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  check (regra <> 'semanal' or cardinality(dias_semana) > 0),
  check (regra <> 'mensal' or dia_mes is not null)
);
alter table tarefas add column recorrente_id uuid references tarefas_recorrentes on delete set null;
create unique index tarefas_recorrente_dia on tarefas (recorrente_id, data) where recorrente_id is not null;

-- Candidaturas (vagas de estágio/aprendiz/emprego).
create type status_candidatura as enum ('enviada', 'em_processo', 'entrevista', 'oferta', 'recusada', 'desisti');
create table candidaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  empresa text not null,
  vaga text not null,
  link text,
  origem text, -- LinkedIn, Gupy, indicação…
  status status_candidatura not null default 'enviada',
  data_envio date not null,
  proxima_acao text, -- ex.: entrevista com RH
  proxima_data date,
  proxima_hora time,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on candidaturas (user_id, data_envio);

-- Sessões de foco (pomodoro) concluídas.
create table focos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  habit_id uuid references habits on delete set null,
  data_local date not null,
  minutos smallint not null check (minutos between 1 and 600),
  criado_em timestamptz not null default now()
);
create index on focos (user_id, data_local);

do $$
declare t text;
begin
  foreach t in array array['tarefas_recorrentes', 'candidaturas', 'focos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "dono" on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

create or replace function public.mesmo_dono_extras() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'tarefas' and new.recorrente_id is not null then
    if not exists (select 1 from public.tarefas_recorrentes r where r.id = new.recorrente_id and r.user_id = new.user_id) then
      raise exception 'Recorrência de outro usuário';
    end if;
  elsif tg_table_name = 'focos' and new.habit_id is not null then
    if not exists (select 1 from public.habits h where h.id = new.habit_id and h.user_id = new.user_id) then
      raise exception 'Hábito de outro usuário';
    end if;
  elsif tg_table_name = 'profiles' and new.foco_habito_id is not null then
    if not exists (select 1 from public.habits h where h.id = new.foco_habito_id and h.user_id = new.user_id) then
      raise exception 'Hábito de outro usuário';
    end if;
  end if;
  return new;
end $$;
create trigger mesmo_dono_extras before insert or update on tarefas for each row execute function public.mesmo_dono_extras();
create trigger mesmo_dono_extras before insert or update on focos for each row execute function public.mesmo_dono_extras();
create trigger mesmo_dono_extras before insert or update on profiles for each row execute function public.mesmo_dono_extras();

create or replace function public.tocar_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger tocar before update on candidaturas for each row execute function public.tocar_atualizado_em();
