-- Repair enhancement catalogue replacement for databases that reject
-- unqualified DELETE statements.
--
-- The original 20260902130000 migration created the durable enhancement tables
-- and RPC, but the RPC used an unqualified full-table delete.
-- Some Supabase/Postgres environments enforce safe updates and reject DELETE
-- without a WHERE clause. Keep the same admin-only replacement API while
-- deleting only rows omitted from the replacement payload.

create or replace function public.replace_business_enhancements(enhancements_payload jsonb)
returns setof public.business_enhancements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  next_index integer := 0;
  next_id text;
  next_name text;
begin
  if not public.current_user_is_booking_admin() then
    raise exception 'Only booking admins can update enhancements.'
      using errcode = '42501';
  end if;

  if enhancements_payload is null or jsonb_typeof(enhancements_payload) <> 'array' then
    raise exception 'Enhancement payload must be an array.'
      using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(enhancements_payload)
  loop
    next_id := btrim(coalesce(item->>'id', ''));
    next_name := btrim(coalesce(item->>'name', ''));

    if next_id = '' or next_name = '' then
      raise exception 'Enhancement id and name are required.'
        using errcode = '22023';
    end if;
  end loop;

  if exists (
    select 1
    from (
      select btrim(coalesce(value->>'id', '')) as enhancement_id
      from jsonb_array_elements(enhancements_payload)
    ) as payload_ids
    group by enhancement_id
    having count(*) > 1
  ) then
    raise exception 'Enhancement ids must be unique.'
      using errcode = '22023';
  end if;

  insert into public.business_enhancement_catalogue (id, initialized_at, updated_at, updated_by)
  values (true, now(), now(), auth.uid())
  on conflict (id) do update
  set updated_at = now(),
      updated_by = auth.uid();

  delete from public.business_enhancements as existing
  where not exists (
    select 1
    from jsonb_array_elements(enhancements_payload) as payload(item)
    where btrim(coalesce(payload.item->>'id', '')) = existing.id
  );

  for item in select value from jsonb_array_elements(enhancements_payload)
  loop
    next_id := btrim(coalesce(item->>'id', ''));
    next_name := btrim(coalesce(item->>'name', ''));

    insert into public.business_enhancements (
      id,
      name,
      description,
      price,
      duration_minutes,
      active,
      display_order,
      updated_by
    )
    values (
      next_id,
      next_name,
      btrim(coalesce(item->>'description', '')),
      greatest(0, coalesce(nullif(item->>'price', '')::numeric, 0)),
      greatest(0, coalesce(nullif(item->>'durationMinutes', '')::integer, 0)),
      coalesce((item->>'active')::boolean, true),
      next_index,
      auth.uid()
    )
    on conflict (id) do update
    set name = excluded.name,
        description = excluded.description,
        price = excluded.price,
        duration_minutes = excluded.duration_minutes,
        active = excluded.active,
        display_order = excluded.display_order,
        updated_by = excluded.updated_by;

    next_index := next_index + 1;
  end loop;

  return query
  select *
  from public.business_enhancements
  order by display_order, name;
end;
$$;

revoke execute on function public.replace_business_enhancements(jsonb) from public;
revoke execute on function public.replace_business_enhancements(jsonb) from anon;
grant execute on function public.replace_business_enhancements(jsonb) to authenticated;
