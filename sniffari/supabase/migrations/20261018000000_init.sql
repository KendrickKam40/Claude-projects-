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
