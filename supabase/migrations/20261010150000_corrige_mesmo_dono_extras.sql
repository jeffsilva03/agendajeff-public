-- Correção: a função anterior lia new.recorrente_id em linhas de profiles (campo inexistente),
-- o que quebrava a criação de perfil no cadastro. Cada tabela agora só acessa os próprios campos.
create or replace function public.mesmo_dono_extras() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'tarefas' then
    if new.recorrente_id is not null and not exists (
      select 1 from public.tarefas_recorrentes r where r.id = new.recorrente_id and r.user_id = new.user_id) then
      raise exception 'Recorrência de outro usuário';
    end if;
  elsif tg_table_name = 'focos' then
    if new.habit_id is not null and not exists (
      select 1 from public.habits h where h.id = new.habit_id and h.user_id = new.user_id) then
      raise exception 'Hábito de outro usuário';
    end if;
  elsif tg_table_name = 'profiles' then
    if new.foco_habito_id is not null and not exists (
      select 1 from public.habits h where h.id = new.foco_habito_id and h.user_id = new.user_id) then
      raise exception 'Hábito de outro usuário';
    end if;
  end if;
  return new;
end $$;
