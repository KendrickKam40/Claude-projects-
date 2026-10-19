-- Sniffari: one-paste setup for a new Supabase project (schema + import function + 29 starter places).
-- Paste all of this into Supabase SQL Editor and press Run. Run it once.

-- Sniffari: initial schema.
-- Places and rules are public to read and written only by the import/seed scripts (service role).
-- Reports, saved places and plans belong to signed-in users. Sign-ups are invite-only (see README).

create extension if not exists postgis with schema extensions;

create type public.dog_status as enum ('off_leash', 'on_lead', 'no_dogs');

-- ---------- Places and their rules ----------
create table public.places (
  id text primary key,
  name text not null,
  kind text not null,
  region text not null,
  area text not null,
  address text,
  location extensions.geography(point, 4326) not null,
  approximate_location boolean not null default false,
  default_status public.dog_status not null,
  default_source jsonb,
  features jsonb not null default '{}'::jsonb,
  notes text[] not null default '{}',
  hazards text[] not null default '{}',
  -- Where the record came from: manual (hand-entered from official pages), city_of_sydney, osm …
  origin text not null default 'manual',
  origin_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index places_location_idx on public.places using gist (location);
create index places_region_idx on public.places (region);

create table public.rules (
  id text primary key,
  place_id text not null references public.places (id) on delete cascade,
  status public.dog_status not null,
  days jsonb,
  time_window jsonb,
  season jsonb,
  priority integer,
  note text,
  source jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rules_place_idx on public.rules (place_id);

-- ---------- People and what they contribute ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);

create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) <= 40),
  size text check (size in ('small', 'medium', 'large')),
  -- e.g. {"reactive": true, "poorRecall": true, "senior": false}
  needs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references public.places (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('confirm', 'flag', 'busy', 'quiet', 'hazard', 'gate_open', 'closed')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index reports_place_time_idx on public.reports (place_id, created_at desc);

create table public.saved_places (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id text not null references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) <= 120),
  day date,
  -- [{ "placeId": "...", "arrive": "10:00", "leave": "11:15", "note": "..." }]
  stops jsonb not null default '[]'::jsonb,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Row level security ----------
alter table public.places enable row level security;
alter table public.rules enable row level security;
alter table public.profiles enable row level security;
alter table public.dogs enable row level security;
alter table public.reports enable row level security;
alter table public.saved_places enable row level security;
alter table public.plans enable row level security;

create policy "places are public" on public.places for select using (true);
create policy "rules are public" on public.rules for select using (true);

create policy "members read profiles" on public.profiles for select to authenticated using (true);
create policy "own profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "own dogs" on public.dogs for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "members read reports" on public.reports for select to authenticated using (true);
create policy "members add reports" on public.reports for insert to authenticated with check (user_id = auth.uid());
create policy "delete own reports" on public.reports for delete to authenticated using (user_id = auth.uid());

create policy "own saved places" on public.saved_places for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own plans" on public.plans for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "members read shared plans" on public.plans for select to authenticated using (shared);

-- ---------- Queries the app calls ----------

-- Places near a point, nearest first, each with its rules embedded.
create or replace function public.nearby_places(lat double precision, lon double precision, radius_m double precision default 60000, max_results integer default 300)
returns table (place jsonb, distance_m double precision)
language sql stable security invoker set search_path = public, extensions as $$
  with here as (select st_setsrid(st_makepoint(lon, lat), 4326)::geography as g)
  select
    (to_jsonb(p) - 'location') || jsonb_build_object(
      'lat', st_y(p.location::geometry),
      'lon', st_x(p.location::geometry),
      'rules', coalesce((select jsonb_agg(to_jsonb(r) - 'place_id' order by r.id) from public.rules r where r.place_id = p.id), '[]'::jsonb)
    ),
    st_distance(p.location, here.g)
  from public.places p, here
  where st_dwithin(p.location, here.g, radius_m)
  order by p.location <-> here.g
  limit max_results;
$$;

-- What owners have reported about a place recently: confirmations, flags, and quiet/busy by hour of the week.
create or replace function public.place_report_summary(target text)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'lastConfirmed', (select max(created_at) from reports where place_id = target and kind = 'confirm'),
    'confirms90d', (select count(*) from reports where place_id = target and kind = 'confirm' and created_at > now() - interval '90 days'),
    'flags90d', (select count(*) from reports where place_id = target and kind = 'flag' and created_at > now() - interval '90 days'),
    'recent', coalesce((select jsonb_agg(x order by x->>'createdAt' desc) from (
        select jsonb_build_object('kind', kind, 'note', note, 'createdAt', created_at) as x
        from reports where place_id = target order by created_at desc limit 20) t), '[]'::jsonb),
    'crowd', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'quiet', q, 'busy', b)) from (
        select extract(dow from created_at at time zone 'Australia/Sydney')::int as dow,
               extract(hour from created_at at time zone 'Australia/Sydney')::int as hr,
               count(*) filter (where kind = 'quiet') as q,
               count(*) filter (where kind = 'busy') as b
        from reports where place_id = target and kind in ('quiet', 'busy') and created_at > now() - interval '180 days'
        group by 1, 2) c), '[]'::jsonb)
  );
$$;

-- Keep updated_at honest.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger places_touch before update on public.places for each row execute function public.touch_updated_at();
create trigger rules_touch before update on public.rules for each row execute function public.touch_updated_at();
create trigger plans_touch before update on public.plans for each row execute function public.touch_updated_at();

-- A profile row for every new member.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, split_part(new.email, '@', 1)) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Bulk import from open data (OpenStreetMap today). Called by the scheduled GitHub Action with the service key only.
-- Never touches hand-entered places, and skips any import that lands within 150 m of one (it's the same park).

create or replace function public.import_places(rows jsonb, source text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r jsonb;
  pt extensions.geography;
  inserted int := 0;
  skipped int := 0;
  removed int := 0;
  kept text[] := '{}';
begin
  if source = 'manual' then
    raise exception 'import_places cannot write manual places';
  end if;

  for r in select * from jsonb_array_elements(rows) loop
    pt := extensions.st_setsrid(extensions.st_makepoint((r->>'lon')::float8, (r->>'lat')::float8), 4326)::extensions.geography;

    if exists (
      select 1 from public.places p
      where p.origin = 'manual' and extensions.st_dwithin(p.location, pt, 150)
    ) or exists (
      select 1 from public.places p where p.id = r->>'id' and p.origin <> source
    ) then
      skipped := skipped + 1;
      continue;
    end if;

    insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status,
                               default_source, features, notes, hazards, origin, origin_ref)
    values (r->>'id', r->>'name', r->>'kind', r->>'region', r->>'area', r->>'address', pt, false,
            (r->>'defaultStatus')::public.dog_status, r->'defaultSource', coalesce(r->'features', '{}'::jsonb),
            coalesce(array(select jsonb_array_elements_text(r->'notes')), '{}'), '{}', source, r->>'originRef')
    on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region,
      area = excluded.area, address = excluded.address, location = excluded.location,
      default_status = excluded.default_status, default_source = excluded.default_source,
      features = excluded.features, notes = excluded.notes, origin_ref = excluded.origin_ref
    where public.places.origin = source;

    inserted := inserted + 1;
    kept := kept || (r->>'id');
  end loop;

  -- Gone from the source, or now covered by a hand-entered place: remove. Only after a non-empty import,
  -- so a failed fetch can't wipe everything.
  if jsonb_array_length(rows) > 0 then
    delete from public.places p where p.origin = source and not (p.id = any (kept));
    get diagnostics removed = row_count;
  end if;

  return jsonb_build_object('upserted', inserted, 'skipped_near_manual', skipped, 'removed', removed);
end;
$$;

revoke all on function public.import_places(jsonb, text) from public, anon, authenticated;
grant execute on function public.import_places(jsonb, text) to service_role;

-- Dog-friendly cafés, restaurants and pubs come in with the import too. A café next to a hand-checked park is a
-- different place, so duplicates are now only skipped against hand-entered places of the same sort (venue vs outdoor).

create or replace function public.import_places(rows jsonb, source text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r jsonb;
  pt extensions.geography;
  is_venue boolean;
  inserted int := 0;
  skipped int := 0;
  removed int := 0;
  kept text[] := '{}';
begin
  if source = 'manual' then
    raise exception 'import_places cannot write manual places';
  end if;

  for r in select * from jsonb_array_elements(rows) loop
    pt := extensions.st_setsrid(extensions.st_makepoint((r->>'lon')::float8, (r->>'lat')::float8), 4326)::extensions.geography;
    is_venue := (r->>'kind') in ('cafe', 'restaurant', 'pub');

    if exists (
      select 1 from public.places p
      where p.origin = 'manual'
        and (p.kind in ('cafe', 'restaurant', 'pub')) = is_venue
        and extensions.st_dwithin(p.location, pt, case when is_venue then 40 else 150 end)
    ) or exists (
      select 1 from public.places p where p.id = r->>'id' and p.origin <> source
    ) then
      skipped := skipped + 1;
      continue;
    end if;

    insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status,
                               default_source, features, notes, hazards, origin, origin_ref)
    values (r->>'id', r->>'name', r->>'kind', r->>'region', r->>'area', r->>'address', pt, false,
            (r->>'defaultStatus')::public.dog_status, r->'defaultSource', coalesce(r->'features', '{}'::jsonb),
            coalesce(array(select jsonb_array_elements_text(r->'notes')), '{}'), '{}', source, r->>'originRef')
    on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region,
      area = excluded.area, address = excluded.address, location = excluded.location,
      default_status = excluded.default_status, default_source = excluded.default_source,
      features = excluded.features, notes = excluded.notes, origin_ref = excluded.origin_ref
    where public.places.origin = source;

    inserted := inserted + 1;
    kept := kept || (r->>'id');
  end loop;

  -- Gone from the source, or now covered by a hand-entered place: remove. Only after a non-empty import,
  -- so a failed fetch can't wipe everything.
  if jsonb_array_length(rows) > 0 then
    delete from public.places p where p.origin = source and not (p.id = any (kept));
    get diagnostics removed = row_count;
  end if;

  return jsonb_build_object('upserted', inserted, 'skipped_near_manual', skipped, 'removed', removed);
end;
$$;

revoke all on function public.import_places(jsonb, text) from public, anon, authenticated;
grant execute on function public.import_places(jsonb, text) to service_role;

-- Generated by scripts/seed-to-sql.ts. Safe to re-run: updates existing rows.
begin;
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('bernie-mullane-ola', 'Bernie Mullane Sports Complex dog park', 'off_leash_park', 'hills_nw', 'The Hills Shire Council', 'Marella Ave, Kellyville', extensions.st_setsrid(extensions.st_makepoint(150.9545, -33.7185), 4326)::extensions.geography, true, 'off_leash', '{"name":"The Hills Shire Council: Off-leash dog parks","url":"https://www.thehills.nsw.gov.au/Residents/Your-Family/Pets-Animals/Find-a-Local-Off-Leash-Dog-Park","checked":"2026-10-17","kind":"official"}'::jsonb, '{"fenced":"full","parking":true}'::jsonb, array['Fenced off-leash area at the sports complex.', 'Max four dogs per handler; dogs must respond to voice command.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'bernie-mullane-ola';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('rutherford-ave-reserve', 'Rutherford Avenue Reserve', 'off_leash_park', 'hills_nw', 'The Hills Shire Council', 'Rutherford Ave, North Kellyville', extensions.st_setsrid(extensions.st_makepoint(150.938, -33.679), 4326)::extensions.geography, true, 'off_leash', '{"name":"The Hills Shire Council: Off-leash dog parks","url":"https://www.thehills.nsw.gov.au/Residents/Your-Family/Pets-Animals/Find-a-Local-Off-Leash-Dog-Park","checked":"2026-10-17","kind":"official"}'::jsonb, '{"fenced":"full"}'::jsonb, array['Off-leash only within the fenced area.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'rutherford-ave-reserve';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('indwarra-reserve', 'Indwarra Avenue Reserve', 'off_leash_park', 'hills_nw', 'The Hills Shire Council', 'Indwarra Ave, North Kellyville', extensions.st_setsrid(extensions.st_makepoint(150.9465, -33.6745), 4326)::extensions.geography, true, 'off_leash', '{"name":"The Hills Shire Council: Off-leash dog parks","url":"https://www.thehills.nsw.gov.au/Residents/Your-Family/Pets-Animals/Find-a-Local-Off-Leash-Dog-Park","checked":"2026-10-17","kind":"official"}'::jsonb, '{"smallDogArea":true}'::jsonb, array['Council describes it as great for smaller dogs. Fencing not confirmed.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'indwarra-reserve';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('coolong-reserve', 'Coolong Reserve dog park', 'off_leash_park', 'hills_nw', 'The Hills Shire Council', 'Coolong St, Castle Hill', extensions.st_setsrid(extensions.st_makepoint(150.9926, -33.7303), 4326)::extensions.geography, true, 'off_leash', '{"name":"The Hills Shire Council: Coolong Reserve","url":"https://www.thehills.nsw.gov.au/Venues/Parks-Recreation/Parks-Recreation-Directory/Coolong-Reserve","checked":"2026-10-17","kind":"official"}'::jsonb, '{"fenced":"full"}'::jsonb, array['Fenced off-leash area beside the playing field.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'coolong-reserve';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('castle-hill-showground-arenas', 'Castle Hill Showground dog arenas', 'off_leash_park', 'hills_nw', 'The Hills Shire Council', 'Showground Rd, Castle Hill', extensions.st_setsrid(extensions.st_makepoint(151.0075, -33.7275), 4326)::extensions.geography, true, 'off_leash', '{"name":"The Hills Shire Council: Off-leash dog parks","url":"https://www.thehills.nsw.gov.au/Residents/Your-Family/Pets-Animals/Find-a-Local-Off-Leash-Dog-Park","checked":"2026-10-17","kind":"official"}'::jsonb, '{"fenced":"full","parking":true}'::jsonb, array['Lower dog arenas are off-leash at all times, except when club training or competitions are on.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'castle-hill-showground-arenas';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('bungarribee-dog-park', 'Bungarribee Park dog park', 'off_leash_park', 'hills_nw', 'Western Sydney Parklands', 'Doonside Rd, Doonside', extensions.st_setsrid(extensions.st_makepoint(150.871, -33.782), 4326)::extensions.geography, true, 'off_leash', '{"name":"Blacktown City Council: Off leash areas","url":"https://www.blacktown.nsw.gov.au/Services/Pets-and-animals/Off-leash-areas","checked":"2026-10-17","kind":"official"}'::jsonb, '{"fenced":"full","parking":true}'::jsonb, array['Fenced off-leash area run by Western Sydney Parklands.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'bungarribee-dog-park';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('alwyn-lindfield-reserve', 'Alwyn Lindfield Reserve', 'off_leash_park', 'hills_nw', 'Blacktown City Council', 'Glenwood Park Dr, Glenwood', extensions.st_setsrid(extensions.st_makepoint(150.927, -33.734), 4326)::extensions.geography, true, 'off_leash', '{"name":"Blacktown City Council: Alwyn Lindfield Reserve","url":"https://www.blacktown.nsw.gov.au/Sport-recreation/Parks-and-recreation-directory/Alwyn-Lindfield-Reserve","checked":"2026-10-17","kind":"official"}'::jsonb, '{"fenced":"full"}'::jsonb, array[]::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'alwyn-lindfield-reserve';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('barnett-park', 'Barnett Park dog area', 'off_leash_park', 'hills_nw', 'City of Parramatta', 'Winston Hills', extensions.st_setsrid(extensions.st_makepoint(150.9879, -33.7787), 4326)::extensions.geography, true, 'off_leash', '{"name":"City of Parramatta: Dog off leash","url":"https://cityofparramatta.nsw.gov.au/dog-parks","checked":"2026-10-17","kind":"official"}'::jsonb, '{"fenced":"full"}'::jsonb, array['No dogs within 10 m of playgrounds.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'barnett-park';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('cumberland-state-forest', 'Cumberland State Forest', 'state_forest', 'hills_nw', 'Forestry Corporation of NSW', 'Castle Hill Rd, West Pennant Hills', extensions.st_setsrid(extensions.st_makepoint(151.035, -33.742), 4326)::extensions.geography, true, 'on_lead', '{"name":"Forestry Corporation: Cumberland State Forest","url":"https://www.forestrycorporation.com.au/visit/forests/cumberland-state-forest","checked":"2026-10-17","kind":"official"}'::jsonb, '{"shade":true,"toilets":true,"parking":true}'::jsonb, array['Dogs must be on a lead at all times here (stricter than most state forests).']::text[], array['Paralysis ticks are common in Sydney bushland. Check your dog after the walk.']::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'cumberland-state-forest';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('sirius-cove', 'Sirius Cove Reserve', 'beach', 'north', 'Mosman Council', 'Sirius Cove Rd, Mosman', extensions.st_setsrid(extensions.st_makepoint(151.2437, -33.8434), 4326)::extensions.geography, true, 'on_lead', '{"name":"NSW Companion Animals Act 1998, s13","url":"https://legislation.nsw.gov.au/view/html/inforce/current/act-1998-087#sec.13","checked":"2026-10-17","kind":"official"}'::jsonb, '{"swimming":true,"water":true}'::jsonb, array['Dogs can swim off-leash in the same windows.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'sirius-cove';
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('sirius-cove:seed-1', 'sirius-cove', 'off_leash', '[1,2,3,4,5]'::jsonb, null, null, null, 'Grass and water', '{"name":"Mosman Council: Where to walk your dog","url":"https://mosman.nsw.gov.au/residents/Pets/where-to-walk-your-dog","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('sirius-cove:seed-2', 'sirius-cove', 'off_leash', '[0,6,"PH"]'::jsonb, '{"from":"16:00","to":"09:00"}'::jsonb, null, null, 'Before 9am and after 4pm on weekends and public holidays', '{"name":"Mosman Council: Where to walk your dog","url":"https://mosman.nsw.gov.au/residents/Pets/where-to-walk-your-dog","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('spit-west', 'Spit West Reserve', 'beach', 'north', 'Mosman Council', 'Spit Rd, Mosman', extensions.st_setsrid(extensions.st_makepoint(151.244, -33.803), 4326)::extensions.geography, true, 'on_lead', '{"name":"NSW Companion Animals Act 1998, s13","url":"https://legislation.nsw.gov.au/view/html/inforce/current/act-1998-087#sec.13","checked":"2026-10-17","kind":"official"}'::jsonb, '{"swimming":true}'::jsonb, array[]::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'spit-west';
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('spit-west:seed-3', 'spit-west', 'off_leash', '[1,2,3,4,5]'::jsonb, null, null, null, null, '{"name":"Mosman Council: Where to walk your dog","url":"https://mosman.nsw.gov.au/residents/Pets/where-to-walk-your-dog","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('spit-west:seed-4', 'spit-west', 'off_leash', '[0,6,"PH"]'::jsonb, '{"from":"16:00","to":"09:00"}'::jsonb, null, null, null, '{"name":"Mosman Council: Where to walk your dog","url":"https://mosman.nsw.gov.au/residents/Pets/where-to-walk-your-dog","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('spit-west:seed-5', 'spit-west', 'on_lead', '[6]'::jsonb, '{"from":"08:30","to":"14:30"}'::jsonb, null, 10, 'Junior sport on Saturdays', '{"name":"Mosman Council: Where to walk your dog","url":"https://mosman.nsw.gov.au/residents/Pets/where-to-walk-your-dog","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('clifton-gardens-east', 'Clifton Gardens beach (east of the jetty)', 'beach', 'north', 'Mosman Council', 'Morella Rd, Mosman', extensions.st_setsrid(extensions.st_makepoint(151.253, -33.838), 4326)::extensions.geography, true, 'on_lead', '{"name":"NSW Companion Animals Act 1998, s13","url":"https://legislation.nsw.gov.au/view/html/inforce/current/act-1998-087#sec.13","checked":"2026-10-17","kind":"official"}'::jsonb, '{"swimming":true}'::jsonb, array['Only the beach and water east of the jetty.', 'Council''s page doesn''t list weekend off-leash times here. Check the signs.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'clifton-gardens-east';
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('clifton-gardens-east:seed-6', 'clifton-gardens-east', 'off_leash', '[1,2,3,4,5]'::jsonb, '{"from":"16:00","to":"09:00"}'::jsonb, '"standard_time"'::jsonb, null, 'Weekdays in winter: before 9am and after 4pm', '{"name":"Mosman Council: Where to walk your dog","url":"https://mosman.nsw.gov.au/residents/Pets/where-to-walk-your-dog","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('clifton-gardens-east:seed-7', 'clifton-gardens-east', 'off_leash', '[1,2,3,4,5]'::jsonb, '{"from":"18:00","to":"09:00"}'::jsonb, '"daylight_saving"'::jsonb, null, 'Weekdays in daylight saving: before 9am and after 6pm', '{"name":"Mosman Council: Where to walk your dog","url":"https://mosman.nsw.gov.au/residents/Pets/where-to-walk-your-dog","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('flora-ritchie-roberts', 'Flora and Ritchie Roberts Reserve', 'off_leash_park', 'north', 'Northern Beaches Council', 'Curl Curl', extensions.st_setsrid(extensions.st_makepoint(151.2885, -33.771), 4326)::extensions.geography, true, 'off_leash', '{"name":"Northern Beaches Council: Flora and Ritchie Roberts Reserve","url":"https://www.northernbeaches.nsw.gov.au/things-to-do/recreation-area/flora-and-ritchie-roberts-reserve","checked":"2026-10-17","kind":"official"}'::jsonb, '{"swimming":true}'::jsonb, array['Off-leash 24 hours in the reserve''s off-leash area; dogs are allowed in Curl Curl Lagoon.', 'Dogs are not allowed on Curl Curl Beach itself.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'flora-ritchie-roberts';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('mona-vale-south', 'Mona Vale Beach (south) trial area', 'beach', 'north', 'Northern Beaches Council', 'Mona Vale', extensions.st_setsrid(extensions.st_makepoint(151.307, -33.682), 4326)::extensions.geography, true, 'no_dogs', '{"name":"Northern Beaches Council: Mona Vale off-leash trial","url":"https://www.northernbeaches.nsw.gov.au/council/news/updated-dog-leash-hours-mona-vale-beach-south","checked":"2026-10-17","kind":"official"}'::jsonb, '{"swimming":true}'::jsonb, array['The off-leash trial ran until 13 October 2026. We haven''t seen a decision since, so treat it as closed to dogs until council confirms.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'mona-vale-south';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('berowra-valley-clarinda', 'Berowra Valley Regional Park: Clarinda trail', 'regional_park', 'north', 'NSW National Parks (regional park)', 'Clarinda St to Simon Pl, Hornsby', extensions.st_setsrid(extensions.st_makepoint(151.088, -33.706), 4326)::extensions.geography, true, 'on_lead', '{"name":"NSW National Parks: Dogs in parks","url":"https://www.nationalparks.nsw.gov.au/conservation-and-heritage/care-for-parks/dogs-in-parks","checked":"2026-10-17","kind":"official"}'::jsonb, '{"shade":true}'::jsonb, array['On-lead dogs only on the Clarinda, Bellamy and Daphne trail sections. Nowhere else in the park.', 'The neighbouring Berowra Valley National Park doesn''t allow dogs.']::text[], array['Paralysis ticks are common in Sydney bushland. Check your dog after the walk.']::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'berowra-valley-clarinda';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('lane-cove-np', 'Lane Cove National Park', 'national_park', 'north', 'NSW National Parks', 'Lady Game Dr, Chatswood West', extensions.st_setsrid(extensions.st_makepoint(151.15, -33.79), 4326)::extensions.geography, true, 'no_dogs', '{"name":"NSW National Parks: Dogs in parks","url":"https://www.nationalparks.nsw.gov.au/conservation-and-heritage/care-for-parks/dogs-in-parks","checked":"2026-10-17","kind":"official"}'::jsonb, '{"toilets":true,"parking":true}'::jsonb, array['Dogs aren''t allowed in NSW national parks, including car parks and picnic areas. Assistance animals excepted.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'lane-cove-np';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('rose-bay-foreshore', 'Rose Bay foreshore', 'walk', 'east_inner_west', 'Woollahra Council', 'Between Dumaresq Reserve and Percival Park, Rose Bay', extensions.st_setsrid(extensions.st_makepoint(151.27, -33.87), 4326)::extensions.geography, true, 'off_leash', '{"name":"Woollahra Council: Rose Bay Foreshore","url":"https://www.woollahra.nsw.gov.au/Recreation/List-of-Parks-Reserves-and-Playgrounds/Rose-Bay-Foreshore","checked":"2026-10-17","kind":"official"}'::jsonb, '{"water":true}'::jsonb, array[]::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'rose-bay-foreshore';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('dumaresq-reserve', 'Dumaresq Reserve', 'off_leash_park', 'east_inner_west', 'Woollahra Council', 'Rose Bay', extensions.st_setsrid(extensions.st_makepoint(151.268, -33.8727), 4326)::extensions.geography, true, 'on_lead', '{"name":"Woollahra Council: Walking your dog","url":"https://www.woollahra.nsw.gov.au/services/animals_and_pets/walking_your_dog","checked":"2026-10-17","kind":"official"}'::jsonb, '{}'::jsonb, array['An older council page says 4:30pm to 8:30am. The current walking-your-dog page says 3:30pm to 10:30am.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'dumaresq-reserve';
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('dumaresq-reserve:seed-8', 'dumaresq-reserve', 'off_leash', null, '{"from":"15:30","to":"10:30"}'::jsonb, null, null, '3:30pm to 10:30am', '{"name":"Woollahra Council: Walking your dog","url":"https://www.woollahra.nsw.gov.au/services/animals_and_pets/walking_your_dog","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('marks-park', 'Marks Park', 'off_leash_park', 'east_inner_west', 'Waverley Council', 'Kenneth St, Tamarama', extensions.st_setsrid(extensions.st_makepoint(151.27, -33.8985), 4326)::extensions.geography, true, 'on_lead', '{"name":"Waverley Council: Off-leash parks","url":"https://waverley.nsw.gov.au/residents/pets/offleash_parks","checked":"2026-10-17","kind":"official"}'::jsonb, '{}'::jsonb, array['No dogs in the bushland or playground. Off-leash hours are suspended during Sculpture by the Sea.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'marks-park';
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('marks-park:seed-9', 'marks-park', 'off_leash', null, '{"from":"16:30","to":"08:30"}'::jsonb, null, null, 'Not during Sculpture by the Sea', '{"name":"Waverley Council: Marks Park","url":"https://www.waverley.nsw.gov.au/recreation/parks_and_reserves/marks_park","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('barracluff-park', 'Barracluff Park', 'off_leash_park', 'east_inner_west', 'Waverley Council', 'North Bondi', extensions.st_setsrid(extensions.st_makepoint(151.279, -33.889), 4326)::extensions.geography, true, 'on_lead', '{"name":"Waverley Council: Off-leash parks","url":"https://waverley.nsw.gov.au/residents/pets/offleash_parks","checked":"2026-10-17","kind":"official"}'::jsonb, '{}'::jsonb, array[]::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'barracluff-park';
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('barracluff-park:seed-10', 'barracluff-park', 'off_leash', null, '{"from":"15:00","to":"10:00"}'::jsonb, null, null, 'Not on the sportsfield during organised sport or events', '{"name":"Waverley Council: Barracluff Park","url":"https://www.waverley.nsw.gov.au/recreation/parks_and_reserves/barracluff_park","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('centennial-park', 'Centennial Park off-leash areas', 'off_leash_park', 'east_inner_west', 'Greater Sydney Parklands', 'Centennial Park', extensions.st_setsrid(extensions.st_makepoint(151.233, -33.897), 4326)::extensions.geography, true, 'off_leash', '{"name":"Centennial Parklands: Dogs in the Parklands","url":"https://www.centennialparklands.com.au/visit/plan-your-visit/regulation","checked":"2026-10-17","kind":"official"}'::jsonb, '{"toilets":true,"parking":true,"water":true,"shade":true}'::jsonb, array['Off-leash in designated areas away from Grand Drive and on sports fields when not in use.', 'On lead near ponds, on roads and shared paths. No dogs within 10 m of playgrounds and BBQs.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'centennial-park';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('callan-point', 'Callan Point beach (Callan Park)', 'beach', 'east_inner_west', 'Greater Sydney Parklands', 'Callan Park, Rozelle', extensions.st_setsrid(extensions.st_makepoint(151.154, -33.862), 4326)::extensions.geography, true, 'on_lead', '{"name":"Greater Sydney Parklands: Callan Park companion animals plan","url":"https://www.greatersydneyparklands.nsw.gov.au/visit/callan-park/plan-your-visit-callan-park/companion-animals-management-plan","checked":"2026-10-17","kind":"official"}'::jsonb, '{"swimming":true}'::jsonb, array['All of Callan Park is on-lead from 10pm to 5am to protect wildlife.', 'There are few signs at the beach itself.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'callan-point';
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('callan-point:seed-11', 'callan-point', 'off_leash', null, '{"from":"05:00","to":"22:00"}'::jsonb, null, null, null, '{"name":"Greater Sydney Parklands: Callan Park companion animals plan","url":"https://www.greatersydneyparklands.nsw.gov.au/visit/callan-park/plan-your-visit-callan-park/companion-animals-management-plan","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('sydney-park', 'Sydney Park', 'off_leash_park', 'city', 'City of Sydney', 'Sydney Park Rd, St Peters', extensions.st_setsrid(extensions.st_makepoint(151.185, -33.91), 4326)::extensions.geography, true, 'off_leash', '{"name":"City of Sydney: Sydney Park","url":"https://www.cityofsydney.nsw.gov.au/parks/sydney-park","checked":"2026-10-17","kind":"official"}'::jsonb, '{"toilets":true,"water":true,"parking":true}'::jsonb, array['Off-leash except the wetlands, Alan Davidson Oval, cycling centre, playground and BBQ areas.', 'Council''s page may be old; check the signs.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'sydney-park';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('greenhills-beach', 'Greenhills Beach off-leash area', 'beach', 'south', 'Sutherland Shire Council', 'Gate 5, Greenhills Beach, Cronulla', extensions.st_setsrid(extensions.st_makepoint(151.17, -34.033), 4326)::extensions.geography, true, 'on_lead', '{"name":"NSW Companion Animals Act 1998, s13","url":"https://legislation.nsw.gov.au/view/html/inforce/current/act-1998-087#sec.13","checked":"2026-10-17","kind":"official"}'::jsonb, '{"swimming":true,"parking":true}'::jsonb, array['Enter at Gate 5. Dogs on lead going in and out.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'greenhills-beach';
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('greenhills-beach:seed-12', 'greenhills-beach', 'off_leash', null, '{"from":"16:00","to":"10:00"}'::jsonb, '"daylight_saving"'::jsonb, null, null, '{"name":"Sutherland Shire Council: Greenhills Beach off-leash area","url":"https://sutherlandshire.nsw.gov.au/living-here/animals-and-pets/dog-parks/greenhills-beach-dog-off-leash-area,-cronulla","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.rules (id, place_id, status, days, time_window, season, priority, note, source) values ('greenhills-beach:seed-13', 'greenhills-beach', 'off_leash', null, '{"from":"15:00","to":"10:00"}'::jsonb, '"standard_time"'::jsonb, null, null, '{"name":"Sutherland Shire Council: Greenhills Beach off-leash area","url":"https://sutherlandshire.nsw.gov.au/living-here/animals-and-pets/dog-parks/greenhills-beach-dog-off-leash-area,-cronulla","checked":"2026-10-17","kind":"official"}'::jsonb);
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('silver-beach-west', 'Silver Beach (western end)', 'beach', 'south', 'Sutherland Shire Council', 'Prince Charles Pde, Kurnell', extensions.st_setsrid(extensions.st_makepoint(151.2, -34.005), 4326)::extensions.geography, true, 'off_leash', '{"name":"Shire Talk: Best dog walks in the Shire","url":"https://shiretalk.com.au/the-best-dog-walks-in-the-shire/","checked":"2026-10-17","kind":"guide"}'::jsonb, '{"swimming":true}'::jsonb, array['We haven''t found an official council page for this one, only local guides. Confirm the signs and boundaries.', 'No dogs on the rest of the beach.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'silver-beach-west';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('lady-robinsons-kyeemagh', 'Lady Robinsons Beach off-leash area', 'beach', 'south', 'Bayside Council', 'Between gates 60 and 61, Kyeemagh', extensions.st_setsrid(extensions.st_makepoint(151.164, -33.948), 4326)::extensions.geography, true, 'off_leash', '{"name":"Bayside Council: Off leash areas","url":"https://www.bayside.nsw.gov.au/services/pets-animals/leash-areas","checked":"2026-10-17","kind":"official"}'::jsonb, '{"swimming":true}'::jsonb, array['24/7 between gates 60 and 61. Dogs aren''t allowed anywhere else on the beach, even on lead.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'lady-robinsons-kyeemagh';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('windyridge-garden', 'Windyridge Garden', 'garden', 'regional', 'Private garden, Mount Wilson', '25 Queens Ave, Mount Wilson', extensions.st_setsrid(extensions.st_makepoint(150.3765, -33.5115), 4326)::extensions.geography, true, 'on_lead', '{"name":"Windyridge Garden: FAQs","url":"https://www.windyridgegarden.com/faqs","checked":"2026-10-17","kind":"official"}'::jsonb, '{"toilets":true}'::jsonb, array['Dogs welcome on lead if socially trained. About $12.50 adult; open daily from 8am.', 'Sloping garden; easier paths to the lookout and toilets.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'windyridge-garden';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('hillbilly-cider', 'Hillbilly Cider Shed', 'cafe', 'regional', 'Bilpin', '2230 Bells Line of Rd, Bilpin', extensions.st_setsrid(extensions.st_makepoint(150.553, -33.502), 4326)::extensions.geography, true, 'on_lead', '{"name":"NSW Companion Animals Act 1998, s13","url":"https://legislation.nsw.gov.au/view/html/inforce/current/act-1998-087#sec.13","checked":"2026-10-17","kind":"official"}'::jsonb, '{"toilets":true,"parking":true}'::jsonb, array['Dogs welcome on the lawn. Open 10am–6pm weekends; book ahead on (02) 4567 0965.']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'hillbilly-cider';
insert into public.places (id, name, kind, region, area, address, location, approximate_location, default_status, default_source, features, notes, hazards, origin)
values ('bellbird-lookout', 'Bellbird Lookout', 'lookout', 'regional', 'Bells Line of Road, Kurrajong Heights', '1183 Bells Line of Rd, Kurrajong Heights', extensions.st_setsrid(extensions.st_makepoint(150.6333, -33.5367), 4326)::extensions.geography, false, 'on_lead', '{"name":"NSW Companion Animals Act 1998, s13","url":"https://legislation.nsw.gov.au/view/html/inforce/current/act-1998-087#sec.13","checked":"2026-10-17","kind":"official"}'::jsonb, '{"toilets":true,"parking":true}'::jsonb, array['Only turn in when heading downhill (east).']::text[], array[]::text[], 'manual')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, region = excluded.region, area = excluded.area, address = excluded.address,
  location = excluded.location, approximate_location = excluded.approximate_location, default_status = excluded.default_status,
  default_source = excluded.default_source, features = excluded.features, notes = excluded.notes, hazards = excluded.hazards;
delete from public.rules where place_id = 'bellbird-lookout';
commit;
