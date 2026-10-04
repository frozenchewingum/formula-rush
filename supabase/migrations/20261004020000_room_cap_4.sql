-- Rooms take 2–4 human drivers; AI fills the rest of the 22-car grid.
create or replace function public.fr_join_room(p_code text, p_name text, p_team smallint)
returns public.fr_rooms
language plpgsql security definer set search_path = '' as $$
declare
  max_players constant int := 4;
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
  return r;
end $$;

revoke all on function public.fr_join_room(text, text, smallint) from public, anon;
grant execute on function public.fr_join_room(text, text, smallint) to authenticated;
