-- Link secreto para assinar a agenda no calendário do celular (feed .ics).
-- Quem tem o link vê compromissos e prazos; dá para gerar um novo e invalidar o antigo.
alter table profiles add column token_calendario uuid not null default gen_random_uuid();
create unique index profiles_token_calendario on profiles (token_calendario);
