-- v1.2 liveries + v1.4 race settings.
-- Players carry their livery and accent so every client paints them the same.
alter table public.fr_room_players add column if not exists livery text not null default 'classic';
alter table public.fr_room_players add column if not exists accent smallint not null default 0;
alter table public.fr_room_players drop constraint if exists fr_room_players_livery_check;
alter table public.fr_room_players add constraint fr_room_players_livery_check check (livery in ('classic', 'split', 'stripe', 'stealth'));
alter table public.fr_room_players drop constraint if exists fr_room_players_accent_check;
alter table public.fr_room_players add constraint fr_room_players_accent_check check (accent between 0 and 4);

-- Laps options are now 1 / 3 / 5 / 8.
alter table public.fr_rooms drop constraint if exists fr_rooms_laps_check;
alter table public.fr_rooms add constraint fr_rooms_laps_check check (laps between 1 and 8);
