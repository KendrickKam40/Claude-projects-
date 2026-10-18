-- Local checks for the schema: run after local-shim.sql, the migration and seed.sql.
\set ON_ERROR_STOP 1
\echo '1. nearby_places from Kellyville, as an anonymous visitor'
set role anon;
select place->>'name' as name, round((distance_m / 1000.0)::numeric, 1) as km, jsonb_array_length(place->'rules') as rules
from public.nearby_places(-33.7135, 150.9395, 15000, 5);
reset role;

\echo '2. anonymous visitors cannot post reports'
set role anon;
do $$ begin
  insert into public.reports (place_id, kind) values ('sirius-cove', 'confirm');
  raise exception 'FAIL: anon insert was allowed';
exception when insufficient_privilege then raise notice 'ok: anon insert blocked';
end $$;
reset role;

\echo '3. a member can report as themselves, but not as someone else'
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'kendrick@example.com'), ('22222222-2222-2222-2222-222222222222', 'ann@example.com');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
set role authenticated;
insert into public.reports (place_id, kind, note) values ('sirius-cove', 'confirm', 'Signs match'), ('sirius-cove', 'quiet', null);
do $$ begin
  insert into public.reports (place_id, kind, user_id) values ('sirius-cove', 'flag', '22222222-2222-2222-2222-222222222222');
  raise exception 'FAIL: spoofed user_id was allowed';
exception when insufficient_privilege or check_violation then raise notice 'ok: spoofed report blocked';
end $$;
\echo '4. summary of reports'
select public.place_report_summary('sirius-cove') ->> 'confirms90d' as confirms, jsonb_array_length(public.place_report_summary('sirius-cove') -> 'crowd') as crowd_cells;
\echo '5. saved places are private'
insert into public.saved_places (place_id) values ('bellbird-lookout');
reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
set role authenticated;
select count(*) as visible_to_other_member from public.saved_places;
\echo '6. members cannot edit places'
do $$ declare n int; begin
  update public.places set name = 'hacked' where id = 'sirius-cove';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'FAIL: member edited a place'; end if;
  raise notice 'ok: place edit had no effect';
exception when insufficient_privilege then raise notice 'ok: place edit blocked';
end $$;
reset role;
\echo '7. profiles are created for new members'
select count(*) as profiles from public.profiles;
