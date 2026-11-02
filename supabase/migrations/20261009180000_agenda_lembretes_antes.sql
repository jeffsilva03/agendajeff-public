-- Prazo único (sem recorrência) pode ter lembretes N dias antes, ex.: {1} = véspera.
alter table events add column lembretes_antes smallint[] not null default '{}';

-- Feriado pode ser desativado por dia na Agenda; exceção com efeito {com_aula:true} também desfaz.
