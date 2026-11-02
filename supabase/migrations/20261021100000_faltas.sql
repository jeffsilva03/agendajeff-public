-- Faltas por disciplina e dia, com motivo opcional.
-- "Não fui para a faculdade" cria também um dia sem aula (evento excecao_rotina) ligado à falta,
-- para a rotina do dia virar a de dia sem aula. Os dias sem aula por outro motivo continuam sendo eventos.
create table faltas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  disciplina_id uuid not null references disciplinas on delete cascade,
  motivo text check (char_length(motivo) <= 200),
  evento_id uuid references events on delete set null,
  criado_em timestamptz not null default now(),
  unique (user_id, data, disciplina_id)
);
create index on faltas (user_id, data);

-- Disciplina e evento precisam ser do mesmo dono.
create or replace function public.falta_mesmo_dono() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.disciplinas d where d.id = new.disciplina_id and d.user_id = new.user_id) then
    raise exception 'Disciplina de outro usuário';
  end if;
  if new.evento_id is not null and not exists (select 1 from public.events e where e.id = new.evento_id and e.user_id = new.user_id) then
    raise exception 'Evento de outro usuário';
  end if;
  return new;
end $$;
create trigger mesmo_dono before insert or update on faltas for each row execute function public.falta_mesmo_dono();

-- RLS: cada um só vê o seu; integrações leem, mas não gravam.
alter table faltas enable row level security;
create policy "dono" on faltas for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "oauth nao grava (insert)" on faltas as restrictive for insert to authenticated with check ((select auth.jwt() ->> 'client_id') is null);
create policy "oauth nao grava (update)" on faltas as restrictive for update to authenticated using ((select auth.jwt() ->> 'client_id') is null) with check ((select auth.jwt() ->> 'client_id') is null);
create policy "oauth nao grava (delete)" on faltas as restrictive for delete to authenticated using ((select auth.jwt() ->> 'client_id') is null);
