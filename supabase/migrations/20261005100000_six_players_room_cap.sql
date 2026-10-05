-- v1.11: 6-player rooms and a cap on how many rooms run at once (Supabase Free = 100 Realtime messages/s
-- for the whole project, so one room at a time).
--
-- Rooms prove they're alive with a heartbeat every ~20 s from every member. A room that hasn't
-- heartbeated for 60 s is treated as gone and closed the next time someone creates a room.

alter table public.fr_rooms add column if not exists heartbeat_at timestamptz not null default now();
-- Existing rooms have never heartbeated: date them by creation so old ghosts don't count as live.
update public.fr_rooms set heartbeat_at = created_at where heartbeat_at > created_at and status in ('lobby', 'racing');

/** How many rooms may be live at once. Change here when the Realtime plan grows. */
create or replace function public.fr_max_rooms() returns int language sql immutable as $$ select 1 $$;

create or replace function public.fr_room_heartbeat(p_room uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.fr_room_players where room_id = p_room and user_id = auth.uid()) then return; end if;
  update public.fr_rooms set heartbeat_at = now() where id = p_room and status in ('lobby', 'racing');
end $$;

/** {active, max}: shown in the Garage so Create Room can be disabled while the server is full. */
create or replace function public.fr_server_status()
returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'active', (select count(*) from public.fr_rooms where status in ('lobby', 'racing') and heartbeat_at > now() - interval '60 seconds'),
    'max', public.fr_max_rooms());
$$;

create or replace function public.fr_create_room(p_name text, p_team smallint, p_laps smallint, p_weather text)
returns public.fr_rooms
language plpgsql security definer set search_path = '' as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  uid uuid := auth.uid();
  c text;
  r public.fr_rooms;
  live int;
begin
  if uid is null then raise exception 'NOT SIGNED IN'; end if;
  -- one create at a time so two players can't both squeeze into the last slot
  perform pg_advisory_xact_lock(hashtext('fr_create_room'));
  -- leave any room I'm still sitting in, then retire rooms whose players have all gone quiet
  perform public.fr_remove_player(rp.room_id, uid) from public.fr_room_players rp where rp.user_id = uid;
  update public.fr_rooms set status = 'closed'
   where status in ('lobby', 'racing') and heartbeat_at < now() - interval '60 seconds';
  select count(*) into live from public.fr_rooms where status in ('lobby', 'racing');
  if live >= public.fr_max_rooms() then raise exception 'SERVER BUSY · A ROOM IS ALREADY RUNNING'; end if;
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

-- Rooms take 2–6 human drivers; AI fills the rest of the 12-car grid.
create or replace function public.fr_join_room(p_code text, p_name text, p_team smallint)
returns public.fr_rooms
language plpgsql security definer set search_path = '' as $$
declare
  max_players constant int := 6;
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
    return r;
  end if;
  if r.status = 'racing' then raise exception 'RACE IN PROGRESS'; end if;
  select count(*) into n from public.fr_room_players where room_id = r.id;
  if n >= max_players then raise exception 'ROOM FULL (%/%)', max_players, max_players; end if;
  perform public.fr_remove_player(rp.room_id, uid) from public.fr_room_players rp where rp.user_id = uid;
  select min(s)::smallint into free_slot from generate_series(0, max_players - 1) s
   where s not in (select slot from public.fr_room_players where room_id = r.id);
  insert into public.fr_room_players (room_id, user_id, slot, name, team, ready)
  values (r.id, uid, free_slot, left(coalesce(nullif(p_name, ''), 'DRIVER'), 12), coalesce(p_team, 0), false);
  update public.fr_rooms set heartbeat_at = now() where id = r.id;
  return r;
end $$;

revoke all on function public.fr_max_rooms() from public, anon;
revoke all on function public.fr_room_heartbeat(uuid) from public, anon;
revoke all on function public.fr_server_status() from public, anon;
revoke all on function public.fr_create_room(text, smallint, smallint, text) from public, anon;
revoke all on function public.fr_join_room(text, text, smallint) from public, anon;
grant execute on function public.fr_max_rooms() to authenticated;
grant execute on function public.fr_room_heartbeat(uuid) to authenticated;
grant execute on function public.fr_server_status() to authenticated;
grant execute on function public.fr_create_room(text, smallint, smallint, text) to authenticated;
grant execute on function public.fr_join_room(text, text, smallint) to authenticated;
