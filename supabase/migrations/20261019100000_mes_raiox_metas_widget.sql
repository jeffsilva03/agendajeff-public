-- Mês: Raio-X da vida, metas do mês e revisão mensal; lembretes periódicos com frases; widget.
-- Aditiva: só cria tabelas e colunas novas (e amplia o tipo de notificação).

-- 1. Raio-X da vida: áreas (editáveis) e as notas de cada mês.
create table raiox_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  ordem smallint not null default 0,
  criado_em timestamptz not null default now(),
  unique (user_id, nome)
);

-- Um registro por mês (primeiro dia do mês): o que sai da agenda e o dia do check-in.
create table raiox_meses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  o_que_sai text,
  checkin text,
  atualizado_em timestamptz not null default now(),
  unique (user_id, mes)
);

-- Notas de 1 a 10 (importância e ação) por área e mês, mais valor, compromisso e foco do mês.
create table raiox_notas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  area_id uuid not null references raiox_areas on delete cascade,
  importancia smallint check (importancia between 1 and 10),
  acao smallint check (acao between 1 and 10),
  valor text,
  compromisso text,
  foco boolean not null default false,
  meta_acao smallint check (meta_acao between 1 and 10),
  como_medir text,
  atualizado_em timestamptz not null default now(),
  unique (user_id, mes, area_id)
);
create index on raiox_notas (user_id, mes);

-- 2. Metas do mês: contagem (alvo numérico), hábito (dias praticados no mês) ou marco (feito / não feito).
create table metas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  titulo text not null check (char_length(titulo) between 1 and 120),
  tipo text not null check (tipo in ('contagem', 'habito', 'marco')),
  alvo numeric(10, 2) check (alvo > 0),
  progresso numeric(10, 2) not null default 0 check (progresso >= 0),
  unidade text,
  habit_id uuid references habits on delete set null,
  area_id uuid references raiox_areas on delete set null,
  como_medir text,
  concluida_em timestamptz,
  origem text not null default 'manual' check (origem in ('manual', 'raiox')),
  ordem smallint not null default 0,
  criado_em timestamptz not null default now()
);
create index on metas (user_id, mes);

-- 3. Revisão mensal: reflexão do mês (os números vêm calculados dos registros).
create table revisoes_mensais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  nota smallint check (nota between 1 and 10),
  funcionou text,
  nao_funcionou text,
  aprendi text,
  foco_proximo text,
  atualizado_em timestamptz not null default now(),
  unique (user_id, mes)
);

-- 4. Frases próprias para os lembretes (somadas às do app).
create table frases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  texto text not null check (char_length(texto) between 3 and 200),
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

-- 5. Perfil: lembrete periódico (desligado por padrão) e o token do widget (só o hash).
alter table profiles
  add column if not exists periodico_ativo boolean not null default false,
  add column if not exists periodico_intervalo smallint not null default 120 check (periodico_intervalo in (60, 90, 120, 180, 240)),
  add column if not exists periodico_inicio time not null default '08:00',
  add column if not exists periodico_fim time not null default '22:00',
  add column if not exists widget_token_hash text,
  add column if not exists widget_token_criado timestamptz;
create unique index if not exists profiles_widget_token_hash on profiles (widget_token_hash) where widget_token_hash is not null;

-- 6. Notificação periódica: novo tipo e um disparo por usuário, horário e dia.
alter table notification_log drop constraint if exists notification_log_tipo_check;
alter table notification_log add constraint notification_log_tipo_check check (tipo in ('agendado', 'teste', 'periodico'));
create unique index notification_log_periodico_unico
  on notification_log (user_id, slot_hora, data_local, coalesce(subscription_id, '00000000-0000-0000-0000-000000000000'))
  where tipo = 'periodico';

-- 7. RLS: cada um só vê o seu. Clientes OAuth não gravam em nada e não leem as reflexões pessoais.
do $$
declare t text;
begin
  foreach t in array array['raiox_areas', 'raiox_meses', 'raiox_notas', 'metas', 'revisoes_mensais', 'frases'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "dono" on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "oauth nao grava (insert)" on %I as restrictive for insert to authenticated with check ((select auth.jwt() ->> ''client_id'') is null)', t);
    execute format('create policy "oauth nao grava (update)" on %I as restrictive for update to authenticated using ((select auth.jwt() ->> ''client_id'') is null) with check ((select auth.jwt() ->> ''client_id'') is null)', t);
    execute format('create policy "oauth nao grava (delete)" on %I as restrictive for delete to authenticated using ((select auth.jwt() ->> ''client_id'') is null)', t);
  end loop;
  foreach t in array array['raiox_meses', 'raiox_notas', 'revisoes_mensais', 'frases'] loop
    execute format('create policy "oauth nao le reflexao pessoal" on %I as restrictive for select to authenticated using ((select auth.jwt() ->> ''client_id'') is null)', t);
  end loop;
end $$;

-- 8. Referências sempre do mesmo dono (área, hábito).
create or replace function public.mesmo_dono_mes() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'raiox_notas' then
    if not exists (select 1 from public.raiox_areas a where a.id = new.area_id and a.user_id = new.user_id) then
      raise exception 'Área de outro usuário';
    end if;
  elsif tg_table_name = 'metas' then
    if new.area_id is not null and not exists (select 1 from public.raiox_areas a where a.id = new.area_id and a.user_id = new.user_id) then
      raise exception 'Área de outro usuário';
    end if;
    if new.habit_id is not null and not exists (select 1 from public.habits h where h.id = new.habit_id and h.user_id = new.user_id) then
      raise exception 'Hábito de outro usuário';
    end if;
  end if;
  return new;
end $$;
create trigger mesmo_dono before insert or update on raiox_notas for each row execute function public.mesmo_dono_mes();
create trigger mesmo_dono before insert or update on metas for each row execute function public.mesmo_dono_mes();

-- Tempo real nas metas (marcar progresso no celular atualiza o PC).
alter publication supabase_realtime add table metas;
