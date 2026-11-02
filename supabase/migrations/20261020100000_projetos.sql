-- Projetos: ideias de projetos para desenvolver, com status, descrição e features.
-- Aditiva: só cria tabelas novas.

create table projetos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  resumo text check (char_length(resumo) <= 160),        -- a ideia em uma frase
  descricao text,
  problema text,                                          -- por que existir / que problema resolve
  publico text,                                           -- para quem
  status text not null default 'ideia'
    check (status in ('ideia', 'planejando', 'desenvolvendo', 'pausado', 'concluido', 'arquivado')),
  status_desde timestamptz not null default now(),
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  categoria text check (categoria in ('pessoal', 'portfolio', 'faculdade', 'negocio', 'estudo')),
  tecnologias text[] not null default '{}',
  repositorio_url text,
  site_url text,
  inicio date,
  prazo date,
  proximo_passo text,
  notas text,
  fixado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on projetos (user_id, status);

-- Features: "essencial" é o que entra na primeira versão (MVP).
create table projeto_features (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  projeto_id uuid not null references projetos on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 140),
  descricao text,
  status text not null default 'a_fazer' check (status in ('a_fazer', 'fazendo', 'feito')),
  prioridade text not null default 'importante' check (prioridade in ('essencial', 'importante', 'extra')),
  ordem smallint not null default 0,
  concluida_em timestamptz,
  criado_em timestamptz not null default now()
);
create index on projeto_features (projeto_id, ordem);

create trigger tocar before update on projetos for each row execute function public.tocar_atualizado_em();

-- Guarda quando o status mudou (para "em desenvolvimento há 12 dias").
create or replace function public.projeto_status_desde() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then new.status_desde := now(); end if;
  return new;
end $$;
create trigger status_desde before update on projetos for each row execute function public.projeto_status_desde();

-- A feature precisa ser de um projeto do mesmo dono; a data de conclusão acompanha o status.
create or replace function public.projeto_feature_coerente() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projetos p where p.id = new.projeto_id and p.user_id = new.user_id) then
    raise exception 'Projeto de outro usuário';
  end if;
  if new.status = 'feito' and new.concluida_em is null then new.concluida_em := now(); end if;
  if new.status <> 'feito' then new.concluida_em := null; end if;
  return new;
end $$;
create trigger coerente before insert or update on projeto_features for each row execute function public.projeto_feature_coerente();

-- RLS: cada um só vê o seu. Clientes OAuth (integrações) não gravam.
do $$
declare t text;
begin
  foreach t in array array['projetos', 'projeto_features'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "dono" on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "oauth nao grava (insert)" on %I as restrictive for insert to authenticated with check ((select auth.jwt() ->> ''client_id'') is null)', t);
    execute format('create policy "oauth nao grava (update)" on %I as restrictive for update to authenticated using ((select auth.jwt() ->> ''client_id'') is null) with check ((select auth.jwt() ->> ''client_id'') is null)', t);
    execute format('create policy "oauth nao grava (delete)" on %I as restrictive for delete to authenticated using ((select auth.jwt() ->> ''client_id'') is null)', t);
  end loop;
end $$;
