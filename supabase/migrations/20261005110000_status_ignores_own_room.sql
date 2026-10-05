-- v1.12: a room where you're the only driver doesn't make the server look busy to you. Creating a
-- new room takes you out of it first (and closes it), so Create Room should stay enabled.
create or replace function public.fr_server_status()
returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'active', (
      select count(*) from public.fr_rooms r
       where r.status in ('lobby', 'racing') and r.heartbeat_at > now() - interval '60 seconds'
         and exists (select 1 from public.fr_room_players p where p.room_id = r.id and p.user_id is distinct from auth.uid())
    ),
    'max', public.fr_max_rooms());
$$;
