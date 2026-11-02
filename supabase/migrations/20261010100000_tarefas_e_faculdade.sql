-- Tarefas avulsas do dia e faculdade (semestres, disciplinas, horários de aula e avaliações).
-- Todas com user_id e RLS por auth.uid(), como o restante do schema.

create table tarefas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  titulo text not null,
  data date not null,
  hora time,
  notas text,
  prioridade smallint not null default 0 check (prioridade in (0, 1)), -- 1 = importante
  concluida_em timestamptz,
  criado_em timestamptz not null default now()
);
create index on tarefas (user_id, data);

create table semestres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nome text not null,
  inicio date not null,
  fim date not null check (fim >= inicio),
  criado_em timestamptz not null default now()
);

create table disciplinas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  semestre_id uuid not null references semestres on delete cascade,
  nome text not null,
  professor text,
  sala text,
  cor text not null default 'azul',
  criado_em timestamptz not null default now()
);

create table aulas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  disciplina_id uuid not null references disciplinas on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  inicio time not null,
  fim time not null check (fim > inicio)
);

create type tipo_avaliacao as enum ('prova', 'trabalho', 'atividade');

create table avaliacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  disciplina_id uuid references disciplinas on delete set null,
  tipo tipo_avaliacao not null,
  titulo text not null,
  data date not null,
  hora time,
  descricao text,
  entregue boolean not null default false,
  nota numeric(5, 2),
  criado_em timestamptz not null default now()
);
create index on avaliacoes (user_id, data);

do $$
declare t text;
begin
  foreach t in array array['tarefas', 'semestres', 'disciplinas', 'aulas', 'avaliacoes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "dono" on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Referências cruzadas do mesmo usuário (estende a função existente).
create or replace function public.mesmo_dono_faculdade() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'disciplinas' then
    if not exists (select 1 from public.semestres s where s.id = new.semestre_id and s.user_id = new.user_id) then
      raise exception 'Semestre de outro usuário';
    end if;
  elsif tg_table_name = 'aulas' then
    if not exists (select 1 from public.disciplinas d where d.id = new.disciplina_id and d.user_id = new.user_id) then
      raise exception 'Disciplina de outro usuário';
    end if;
  elsif tg_table_name = 'avaliacoes' and new.disciplina_id is not null then
    if not exists (select 1 from public.disciplinas d where d.id = new.disciplina_id and d.user_id = new.user_id) then
      raise exception 'Disciplina de outro usuário';
    end if;
  end if;
  return new;
end $$;
create trigger mesmo_dono before insert or update on disciplinas for each row execute function public.mesmo_dono_faculdade();
create trigger mesmo_dono before insert or update on aulas for each row execute function public.mesmo_dono_faculdade();
create trigger mesmo_dono before insert or update on avaliacoes for each row execute function public.mesmo_dono_faculdade();

-- Tarefas sincronizam entre celular e PC em tempo real, como os checks.
alter publication supabase_realtime add table tarefas;
