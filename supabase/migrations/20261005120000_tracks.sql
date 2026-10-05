-- v1.18: more circuits. Rooms carry the host's track; results remember where they were set.
-- Backward compatible: new columns have defaults and the room RPCs take an optional p_track,
-- so clients that don't know about tracks keep working on the original circuit.

alter table public.fr_rooms
  add column if not exists track text not null default 'circuit-1';
alter table public.fr_rooms drop constraint if exists fr_rooms_track_check;
alter table public.fr_rooms
  add constraint fr_rooms_track_check check (track in ('circuit-1', 'monsoon', 'harbour'));

alter table public.fr_race_results
  add column if not exists track_id text not null default 'circuit-1';
create index if not exists fr_race_results_track on public.fr_race_results (track_id);

-- fr_create_room: + p_track
drop function if exists public.fr_create_room(text, smallint, smallint, text);
create or replace function public.fr_create_room(p_name text, p_team smallint, p_laps smallint, p_weather text, p_track text default null)
returns public.fr_rooms
language plpgsql
security definer
set search_path to ''
as $function$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  uid uuid := auth.uid();
  c text;
  r public.fr_rooms;
  live int;
begin
  if uid is null then raise exception 'NOT SIGNED IN'; end if;
  perform pg_advisory_xact_lock(hashtext('fr_create_room'));
  perform public.fr_remove_player(rp.room_id, uid) from public.fr_room_players rp where rp.user_id = uid;
  update public.fr_rooms set status = 'closed'
   where status in ('lobby', 'racing') and heartbeat_at < now() - interval '60 seconds';
  select count(*) into live from public.fr_rooms where status in ('lobby', 'racing');
  if live >= public.fr_max_rooms() then raise exception 'SERVER BUSY · A ROOM IS ALREADY RUNNING'; end if;
  for attempt in 1..30 loop
    c := '';
    for i in 1..4 loop c := c || substr(abc, 1 + floor(random() * 32)::int, 1); end loop;
    begin
      insert into public.fr_rooms (code, host_id, laps, weather, track)
      values (c, uid, coalesce(p_laps, 3), coalesce(p_weather, 'Random'), coalesce(p_track, 'circuit-1'))
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
end $function$;

-- fr_set_room: + p_track
drop function if exists public.fr_set_room(uuid, text, smallint, text);
create or replace function public.fr_set_room(p_room uuid, p_status text, p_laps smallint default null, p_weather text default null, p_track text default null)
returns public.fr_rooms
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r public.fr_rooms;
begin
  update public.fr_rooms
     set status = coalesce(p_status, status),
         laps = coalesce(p_laps, laps),
         weather = coalesce(p_weather, weather),
         track = coalesce(p_track, track)
   where id = p_room and host_id = auth.uid() and status <> 'closed'
  returning * into r;
  if r.id is null then raise exception 'NOT HOST'; end if;
  if p_status = 'lobby' then
    update public.fr_room_players set ready = false where room_id = p_room;
  end if;
  return r;
end $function$;

revoke all on function public.fr_create_room(text, smallint, smallint, text, text) from public, anon;
revoke all on function public.fr_set_room(uuid, text, smallint, text, text) from public, anon;
grant execute on function public.fr_create_room(text, smallint, smallint, text, text) to authenticated, service_role;
grant execute on function public.fr_set_room(uuid, text, smallint, text, text) to authenticated, service_role;
