-- v1.5 tyre compounds + Pit Stop Rush.
-- Each result records how many stops the driver made, their fastest stop and their tyre strategy (e.g. "S-M").
alter table public.fr_race_results add column if not exists pit_stops smallint not null default 0;
alter table public.fr_race_results add column if not exists best_pit real;
alter table public.fr_race_results add column if not exists tyres text;

alter table public.fr_race_results drop constraint if exists fr_race_results_pit_stops_check;
alter table public.fr_race_results add constraint fr_race_results_pit_stops_check check (pit_stops between 0 and 20);
alter table public.fr_race_results drop constraint if exists fr_race_results_best_pit_check;
alter table public.fr_race_results add constraint fr_race_results_best_pit_check check (best_pit is null or best_pit between 0.5 and 60);
alter table public.fr_race_results drop constraint if exists fr_race_results_tyres_check;
alter table public.fr_race_results add constraint fr_race_results_tyres_check check (tyres is null or tyres ~ '^[SMHW](-[SMHW]){0,20}$');

-- Fastest pit stops board.
create index if not exists fr_race_results_best_pit on public.fr_race_results (best_pit) where best_pit is not null;
