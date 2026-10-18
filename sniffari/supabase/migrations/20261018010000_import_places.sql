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
