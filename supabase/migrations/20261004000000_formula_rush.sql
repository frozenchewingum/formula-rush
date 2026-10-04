-- Formula Rush schema. All objects are prefixed fr_ so they can live alongside
-- other apps in the same Supabase project.

create table if not exists public.fr_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'DRIVER' check (char_length(name) between 1 and 12),
  team smallint not null default 0 check (team between 0 and 4),
  created_at timestamptz not null default now()
);

create table if not exists public.fr_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$'),
  host_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'racing', 'closed')),
  laps smallint not null default 3 check (laps between 1 and 5),
  weather text not null default 'Random' check (weather in ('Random', 'Dry', 'Rain', 'Rain on final lap')),
  created_at timestamptz not null default now()
);
-- Codes are unique only while a room is live.
create unique index if not exists fr_rooms_live_code on public.fr_rooms (code) where status in ('lobby', 'racing');

create table if not exists public.fr_room_players (
  room_id uuid not null references public.fr_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  slot smallint not null check (slot between 0 and 3),
  name text not null default 'DRIVER' check (char_length(name) between 1 and 12),
  team smallint not null default 0 check (team between 0 and 4),
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, slot)
);
create index if not exists fr_room_players_user on public.fr_room_players (user_id);

create table if not exists public.fr_race_results (
  id bigint generated always as identity primary key,
  room_id uuid references public.fr_rooms (id) on delete set null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  total_time real not null check (total_time > 0),
  best_lap real check (best_lap > 0),
  apexes text,
  contacts smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists fr_race_results_user on public.fr_race_results (user_id);
create index if not exists fr_race_results_room on public.fr_race_results (room_id);

create table if not exists public.fr_best_laps (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  lap_time real not null check (lap_time >= 15),
  ghost jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
create index if not exists fr_best_laps_board on public.fr_best_laps (track_id, lap_time);

-- ---------- RLS: everyone signed in reads, writes only own rows ----------
alter table public.fr_profiles enable row level security;
alter table public.fr_rooms enable row level security;
alter table public.fr_room_players enable row level security;
alter table public.fr_race_results enable row level security;
alter table public.fr_best_laps enable row level security;

create policy fr_profiles_read on public.fr_profiles for select to authenticated using (true);
create policy fr_profiles_insert on public.fr_profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy fr_profiles_update on public.fr_profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy fr_rooms_read on public.fr_rooms for select to authenticated using (true);
-- rooms are created/changed only through the security-definer functions below

create policy fr_room_players_read on public.fr_room_players for select to authenticated using (true);
create policy fr_room_players_update on public.fr_room_players for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy fr_race_results_read on public.fr_race_results for select to authenticated using (true);
create policy fr_race_results_insert on public.fr_race_results for insert to authenticated with check ((select auth.uid()) = user_id);

create policy fr_best_laps_read on public.fr_best_laps for select to authenticated using (true);
-- best laps are written through fr_submit_best_lap so only improvements are kept

-- Players may only change ready/name/team on their own row, never slot or room.
create or replace function public.fr_room_players_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.slot <> old.slot or new.room_id <> old.room_id or new.user_id <> old.user_id then
    raise exception 'cannot change slot';
  end if;
  return new;
end $$;
drop trigger if exists fr_room_players_guard on public.fr_room_players;
create trigger fr_room_players_guard before update on public.fr_room_players
  for each row execute function public.fr_room_players_guard();

-- ---------- Room functions ----------
create or replace function public.fr_now() returns double precision
language sql stable set search_path = '' as $$
  select extract(epoch from clock_timestamp()) * 1000
$$;

-- Remove a player; the oldest remaining player inherits host; empty rooms close.
create or replace function public.fr_remove_player(p_room uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  next_host uuid;
begin
  delete from public.fr_room_players where room_id = p_room and user_id = p_user;
  select user_id into next_host from public.fr_room_players where room_id = p_room order by joined_at limit 1;
  if next_host is null then
    update public.fr_rooms set status = 'closed' where id = p_room;
  else
    update public.fr_rooms set host_id = next_host where id = p_room and host_id = p_user;
  end if;
end $$;
revoke all on function public.fr_remove_player(uuid, uuid) from public, anon, authenticated;

create or replace function public.fr_leave_room(p_room uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  perform public.fr_remove_player(p_room, auth.uid());
end $$;

create or replace function public.fr_create_room(p_name text, p_team smallint, p_laps smallint, p_weather text)
returns public.fr_rooms
language plpgsql security definer set search_path = '' as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  uid uuid := auth.uid();
  c text;
  r public.fr_rooms;
begin
  if uid is null then raise exception 'NOT SIGNED IN'; end if;
  -- leave any room I'm still sitting in
  perform public.fr_remove_player(rp.room_id, uid) from public.fr_room_players rp where rp.user_id = uid;
  for attempt in 1..30 loop
    c := '';
    for i in 1..4 loop c := c || substr(abc, 1 + floor(random() * 32)::int, 1); end loop;
    begin
      insert into public.fr_rooms (code, host_id, laps, weather)
      values (c, uid, coalesce(p_laps, 3), coalesce(p_weather, 'Random'))
      returning * into r;
      exit;
    exception when unique_violation then
      r := null;
    end;
  end loop;
  if r.id is null then raise exception 'NO FREE CODE'; end if;
  insert into public.fr_room_players (room_id, user_id, slot, name, team, ready)
  values (r.id, uid, 0, left(coalesce(nullif(p_name, ''), 'DRIVER'), 12), coalesce(p_team, 0), false);
  return r;
end $$;

create or replace function public.fr_join_room(p_code text, p_name text, p_team smallint)
returns public.fr_rooms
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.fr_rooms;
  n int;
  free_slot smallint;
begin
  if uid is null then raise exception 'NOT SIGNED IN'; end if;
  select * into r from public.fr_rooms
   where code = upper(p_code) and status in ('lobby', 'racing')
   order by created_at desc limit 1 for update;
  if r.id is null then raise exception 'ROOM NOT FOUND'; end if;
  if exists (select 1 from public.fr_room_players where room_id = r.id and user_id = uid) then
    return r; -- rejoin
  end if;
  if r.status = 'racing' then raise exception 'RACE IN PROGRESS'; end if;
  select count(*) into n from public.fr_room_players where room_id = r.id;
  if n >= 4 then raise exception 'ROOM FULL (4/4)'; end if;
  perform public.fr_remove_player(rp.room_id, uid) from public.fr_room_players rp where rp.user_id = uid;
  select min(s)::smallint into free_slot from generate_series(0, 3) s
   where s not in (select slot from public.fr_room_players where room_id = r.id);
  insert into public.fr_room_players (room_id, user_id, slot, name, team, ready)
  values (r.id, uid, free_slot, left(coalesce(nullif(p_name, ''), 'DRIVER'), 12), coalesce(p_team, 0), false);
  return r;
end $$;

-- Host drops a player whose connection vanished (presence gone for a while).
create or replace function public.fr_kick_player(p_room uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.fr_rooms where id = p_room and host_id = auth.uid()) then
    raise exception 'NOT HOST';
  end if;
  perform public.fr_remove_player(p_room, p_user);
end $$;

-- If the host's connection vanished, the oldest other player can take over.
create or replace function public.fr_claim_host(p_room uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.fr_rooms;
  oldest uuid;
begin
  select * into r from public.fr_rooms where id = p_room for update;
  if r.id is null then return; end if;
  select user_id into oldest from public.fr_room_players
   where room_id = p_room and user_id <> r.host_id order by joined_at limit 1;
  if oldest is distinct from auth.uid() then raise exception 'NOT NEXT HOST'; end if;
  delete from public.fr_room_players where room_id = p_room and user_id = r.host_id;
  update public.fr_rooms set host_id = auth.uid() where id = p_room;
end $$;

create or replace function public.fr_set_room(p_room uuid, p_status text, p_laps smallint default null, p_weather text default null)
returns public.fr_rooms
language plpgsql security definer set search_path = '' as $$
declare
  r public.fr_rooms;
begin
  update public.fr_rooms
     set status = coalesce(p_status, status),
         laps = coalesce(p_laps, laps),
         weather = coalesce(p_weather, weather)
   where id = p_room and host_id = auth.uid() and status <> 'closed'
  returning * into r;
  if r.id is null then raise exception 'NOT HOST'; end if;
  if p_status = 'lobby' then
    update public.fr_room_players set ready = false where room_id = p_room;
  end if;
  return r;
end $$;

create or replace function public.fr_submit_best_lap(p_track text, p_lap real, p_ghost jsonb default null)
returns real
language plpgsql security definer set search_path = '' as $$
declare
  best real;
begin
  if auth.uid() is null then raise exception 'NOT SIGNED IN'; end if;
  if p_lap < 15 then raise exception 'IMPLAUSIBLE LAP'; end if;
  insert into public.fr_best_laps as b (user_id, track_id, lap_time, ghost)
  values (auth.uid(), p_track, p_lap, p_ghost)
  on conflict (user_id, track_id) do update
     set lap_time = excluded.lap_time, ghost = excluded.ghost, updated_at = now()
   where excluded.lap_time < b.lap_time;
  select lap_time into best from public.fr_best_laps where user_id = auth.uid() and track_id = p_track;
  return best;
end $$;

revoke all on function public.fr_create_room(text, smallint, smallint, text) from public, anon;
revoke all on function public.fr_join_room(text, text, smallint) from public, anon;
revoke all on function public.fr_leave_room(uuid) from public, anon;
revoke all on function public.fr_kick_player(uuid, uuid) from public, anon;
revoke all on function public.fr_claim_host(uuid) from public, anon;
revoke all on function public.fr_set_room(uuid, text, smallint, text) from public, anon;
revoke all on function public.fr_submit_best_lap(text, real, jsonb) from public, anon;
revoke all on function public.fr_room_players_guard() from public, anon, authenticated;
grant execute on function public.fr_create_room(text, smallint, smallint, text) to authenticated;
grant execute on function public.fr_join_room(text, text, smallint) to authenticated;
grant execute on function public.fr_leave_room(uuid) to authenticated;
grant execute on function public.fr_kick_player(uuid, uuid) to authenticated;
grant execute on function public.fr_claim_host(uuid) to authenticated;
grant execute on function public.fr_set_room(uuid, text, smallint, text) to authenticated;
grant execute on function public.fr_submit_best_lap(text, real, jsonb) to authenticated;
grant execute on function public.fr_now() to anon, authenticated;

-- Lobby listens to row changes.
alter table public.fr_room_players replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.fr_room_players, public.fr_rooms;
exception when duplicate_object then null; end $$;
