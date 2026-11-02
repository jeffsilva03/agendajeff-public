-- Integração com o APIClassroom (Google Classroom, somente leitura).
-- Aditiva: só cria tabelas novas. As escritas de sincronização são feitas pelo servidor do app
-- (service role) depois de validar a sessão; o navegador só altera os campos pessoais e as preferências.

-- 1. Conexão (estado visível ao usuário, sem segredos).
create table classroom_conexoes (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  estado text not null default 'desconectado' check (estado in ('desconectado', 'conectado', 'reconectar')),
  identidade text,                       -- sub do Auth0 (para conferência; o APIClassroom só aceita o dono)
  conectado_em timestamptz,
  auto_sync boolean not null default true,
  sync_iniciada_em timestamptz,          -- trava: uma sincronização por vez
  ultima_sync_em timestamptz,
  ultima_sync_ok_em timestamptz,         -- última completa (todas as turmas acompanhadas)
  ultima_sync_resultado jsonb,
  atualizado_em timestamptz not null default now()
);

-- 2. Tokens (cifrados com AES-256-GCM pelo servidor). RLS sem nenhuma política: só o service role lê.
create table classroom_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  access_token text not null,
  refresh_token text,
  expira_em timestamptz not null,
  escopo text,
  renovacao_iniciada_em timestamptz,     -- trava da renovação: com rotação, um refresh token só pode ser usado uma vez
  atualizado_em timestamptz not null default now()
);

-- 3. Turmas vistas no Classroom e a escolha de quais acompanhar.
create table classroom_turmas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_id text not null check (course_id ~ '^[A-Za-z0-9_-]{1,180}$'),
  nome text not null,
  estado text,                           -- courseState (ACTIVE/ARCHIVED); null quando parou de aparecer
  aliases text[] not null default '{}',
  link text,
  atualizado_origem timestamptz,
  visto_em timestamptz,
  acompanhar boolean not null default false,
  nome_exibicao text check (char_length(nome_exibicao) <= 80),
  disciplina_id uuid references disciplinas on delete set null,
  ultima_sync_ok_em timestamptz,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  unique (user_id, course_id)
);

-- 4. Atividades (snapshot oficial + campos pessoais separados).
create table classroom_atividades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source text not null default 'google_classroom' check (source = 'google_classroom'),
  course_id text not null,
  activity_id text not null check (activity_id ~ '^[A-Za-z0-9_-]{1,180}$'),
  -- Oficial (só a sincronização escreve)
  titulo text not null,
  descricao text,
  descricao_truncada boolean not null default false,
  tipo text,
  link text,
  anexos jsonb not null default '[]',
  estado_publicacao text,
  pontuacao_maxima numeric,
  prazo_em timestamptz,                  -- instante completo (precisao = instante)
  prazo_data date,                       -- data sem horário (precisao = somente_data_utc)
  prazo_precisao text not null default 'sem_prazo' check (prazo_precisao in ('instante', 'somente_data_utc', 'incompleto', 'sem_prazo')),
  criado_origem timestamptz,
  atualizado_origem timestamptz,
  entrega_id text,
  entrega_estado text check (entrega_estado in ('NEW', 'CREATED', 'TURNED_IN', 'RETURNED', 'RECLAIMED_BY_STUDENT')),
  entrega_atrasada boolean,
  nota numeric,
  entrega_atualizada_origem timestamptz,
  entrega_link text,
  -- Acompanhamento da sincronização
  visto_em timestamptz not null default now(),
  ausente_desde timestamptz,             -- não apareceu numa sincronização completa da turma
  mudou_em timestamptz,                  -- última mudança relevante (título, prazo, entrega, nota)
  mudancas text[] not null default '{}', -- o que mudou na última vez: titulo, prazo, entrega, nota, descricao
  prazo_anterior jsonb,                  -- {em, data, precisao} antes da última mudança de prazo
  -- Pessoal (a sincronização nunca escreve)
  status_pessoal text not null default 'a_fazer' check (status_pessoal in ('a_fazer', 'fazendo', 'pronto')),
  prioridade smallint not null default 0 check (prioridade in (0, 1)),
  notas_pessoais text,
  inicio_planejado date,
  avaliacao_id uuid references avaliacoes on delete set null,
  criado_em timestamptz not null default now(),
  unique (user_id, source, course_id, activity_id)
);
create index on classroom_atividades (user_id, course_id);
create index on classroom_atividades (user_id, prazo_em);

-- 5. Histórico das sincronizações.
create table classroom_sincronizacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  origem text not null check (origem in ('manual', 'automatica')),
  iniciada_em timestamptz not null default now(),
  terminada_em timestamptz,
  resultado text check (resultado in ('ok', 'parcial', 'erro')),
  resumo jsonb,
  erros jsonb
);
create index on classroom_sincronizacoes (user_id, iniciada_em desc);

-- Vínculos precisam ser do mesmo dono.
create or replace function public.classroom_mesmo_dono() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Cada tabela só acessa os próprios campos (o PL/pgSQL não deixa ler campo inexistente do registro).
  if tg_table_name = 'classroom_turmas' then
    if new.disciplina_id is not null and not exists (select 1 from public.disciplinas d where d.id = new.disciplina_id and d.user_id = new.user_id) then
      raise exception 'Disciplina de outro usuário';
    end if;
  elsif tg_table_name = 'classroom_atividades' then
    if new.avaliacao_id is not null and not exists (select 1 from public.avaliacoes a where a.id = new.avaliacao_id and a.user_id = new.user_id) then
      raise exception 'Avaliação de outro usuário';
    end if;
  end if;
  return new;
end $$;
create trigger mesmo_dono before insert or update on classroom_turmas for each row execute function public.classroom_mesmo_dono();
create trigger mesmo_dono before insert or update on classroom_atividades for each row execute function public.classroom_mesmo_dono();

-- RLS: cada um só lê o seu. Tokens: nenhuma política (o navegador nem integrações leem).
alter table classroom_conexoes enable row level security;
alter table classroom_tokens enable row level security;
alter table classroom_turmas enable row level security;
alter table classroom_atividades enable row level security;
alter table classroom_sincronizacoes enable row level security;

create policy "dono le" on classroom_conexoes for select to authenticated using (user_id = (select auth.uid()));
create policy "dono le" on classroom_turmas for select to authenticated using (user_id = (select auth.uid()));
create policy "dono le" on classroom_atividades for select to authenticated using (user_id = (select auth.uid()));
create policy "dono le" on classroom_sincronizacoes for select to authenticated using (user_id = (select auth.uid()));
-- Preferências e campos pessoais: o dono altera só as colunas liberadas abaixo (e nunca por cliente OAuth).
create policy "dono altera" on classroom_conexoes for update to authenticated
  using (user_id = (select auth.uid()) and (select auth.jwt() ->> 'client_id') is null) with check (user_id = (select auth.uid()));
create policy "dono altera" on classroom_turmas for update to authenticated
  using (user_id = (select auth.uid()) and (select auth.jwt() ->> 'client_id') is null) with check (user_id = (select auth.uid()));
create policy "dono altera" on classroom_atividades for update to authenticated
  using (user_id = (select auth.uid()) and (select auth.jwt() ->> 'client_id') is null) with check (user_id = (select auth.uid()));

-- Permissões por coluna: o usuário não insere, não apaga e não mexe nos dados oficiais.
revoke insert, update, delete on classroom_conexoes, classroom_tokens, classroom_turmas, classroom_atividades, classroom_sincronizacoes from anon, authenticated;
revoke select on classroom_tokens from anon, authenticated;
grant update (auto_sync) on classroom_conexoes to authenticated;
grant update (acompanhar, nome_exibicao, disciplina_id) on classroom_turmas to authenticated;
grant update (status_pessoal, prioridade, notas_pessoais, inicio_planejado, avaliacao_id) on classroom_atividades to authenticated;

-- Sincronização automática: pg_cron chama a rota do app a cada 3 horas (URL no Vault; mesmo segredo do cron dos lembretes).
--   select vault.create_secret('https://SEU-APP/api/classroom/cron', 'url_classroom_sync');
create or replace function public.disparar_classroom_sync() returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'url_classroom_sync');
  v_segredo text := (select decrypted_secret from vault.decrypted_secrets where name = 'segredo_cron');
begin
  if v_url is null or v_segredo is null then
    return null; -- sem configuração: não faz nada
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;
revoke execute on function public.disparar_classroom_sync() from public, anon, authenticated;
select cron.schedule('classroom-sync', '17 */3 * * *', 'select public.disparar_classroom_sync()');
