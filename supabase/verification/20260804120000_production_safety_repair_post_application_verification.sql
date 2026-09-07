-- Read-only post-application verification for 20260804120000_production_safety_repair.sql.
-- Run after applying the repair migration. It returns one unified result table.

with
expected_function_signatures as (
  select *
  from (
    values
      (10, 'public.booking_app_notes_json(text)', true, false, false, false, 'public, pg_temp'),
      (20, 'public.booking_reference_from_notes(text)', true, false, false, false, 'public, pg_temp'),
      (30, 'public.get_public_booking_blocks(date, date)', true, true, true, true, 'public, pg_temp'),
      (40, 'public.reschedule_client_booking(uuid, date, integer)', true, true, false, true, 'public, pg_temp'),
      (50, 'public.link_recent_guest_booking_to_client(jsonb)', true, true, false, true, 'public, pg_temp'),
      (60, 'public.create_secure_order(jsonb)', true, true, true, true, 'public, pg_temp'),
      (70, 'public.create_booking_hold(date, integer, integer, integer, text)', true, true, true, true, 'public, pg_temp'),
      (80, 'public.release_booking_hold(uuid, uuid, text)', true, true, true, true, 'public, pg_temp')
  ) as expected(sort_order, signature, should_exist, should_be_security_definer, anon_should_execute, authenticated_should_execute, expected_search_path)
),
expected_absent_signatures as (
  select *
  from (
    values
      (90, 'public.create_booking_hold(date, integer, integer, integer)'),
      (100, 'public.release_booking_hold(uuid, uuid)')
  ) as expected(sort_order, signature)
),
resolved_expected as (
  select
    expected.*,
    to_regprocedure(expected.signature) as function_oid
  from expected_function_signatures expected
),
expected_issues as (
  select
    signature,
    case
      when should_exist and function_oid is null then 'missing'
      when should_be_security_definer and p.prosecdef is distinct from true then 'not_security_definer'
      when coalesce(array_to_string(p.proconfig, ','), '') not like '%' || 'search_path=' || expected_search_path || '%' then 'unsafe_or_missing_search_path'
      when has_function_privilege('public', p.oid, 'EXECUTE') is distinct from false then 'public_can_execute'
      when has_function_privilege('anon', p.oid, 'EXECUTE') is distinct from anon_should_execute then 'anon_execute_mismatch'
      when has_function_privilege('authenticated', p.oid, 'EXECUTE') is distinct from authenticated_should_execute then 'authenticated_execute_mismatch'
      else null
    end as issue,
    jsonb_build_object(
      'signature', signature,
      'exists', function_oid is not null,
      'security_definer', p.prosecdef,
      'function_config', p.proconfig,
      'public_can_execute', case when p.oid is null then null else has_function_privilege('public', p.oid, 'EXECUTE') end,
      'anon_can_execute', case when p.oid is null then null else has_function_privilege('anon', p.oid, 'EXECUTE') end,
      'authenticated_can_execute', case when p.oid is null then null else has_function_privilege('authenticated', p.oid, 'EXECUTE') end
    ) as detail
  from resolved_expected expected
  left join pg_proc p on p.oid = expected.function_oid
),
absent_issues as (
  select
    absent.signature,
    to_regprocedure(absent.signature) as function_oid,
    jsonb_build_object(
      'signature', absent.signature,
      'exists', to_regprocedure(absent.signature) is not null,
      'public_can_execute', case when to_regprocedure(absent.signature) is null then null else has_function_privilege('public', to_regprocedure(absent.signature), 'EXECUTE') end,
      'anon_can_execute', case when to_regprocedure(absent.signature) is null then null else has_function_privilege('anon', to_regprocedure(absent.signature), 'EXECUTE') end,
      'authenticated_can_execute', case when to_regprocedure(absent.signature) is null then null else has_function_privilege('authenticated', to_regprocedure(absent.signature), 'EXECUTE') end
    ) as detail
  from expected_absent_signatures absent
  where to_regprocedure(absent.signature) is not null
    and (
      has_function_privilege('public', to_regprocedure(absent.signature), 'EXECUTE')
      or has_function_privilege('anon', to_regprocedure(absent.signature), 'EXECUTE')
      or has_function_privilege('authenticated', to_regprocedure(absent.signature), 'EXECUTE')
    )
),
hold_overloads as (
  select
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('create_booking_hold', 'release_booking_hold')
),
unexpected_hold_overloads as (
  select *
  from hold_overloads
  where (function_name, arguments) not in (
    ('create_booking_hold', 'hold_date date, hold_start_minutes integer, hold_duration_minutes integer, hold_buffer_minutes integer, hold_client_key text'),
    ('release_booking_hold', 'release_hold_id uuid, release_hold_token uuid, release_client_key text')
  )
),
affected_tables as (
  select
    table_name,
    to_regclass('public.' || table_name) as table_oid
  from (
    values ('bookings'), ('orders'), ('booking_holds'), ('client_addresses')
  ) as tables(table_name)
),
affected_table_counts as (
  select
    (select count(*) from public.bookings)::bigint as bookings_count,
    (select count(*) from public.orders)::bigint as orders_count,
    (select count(*) from public.booking_holds)::bigint as booking_holds_count,
    (select count(*) from public.client_addresses)::bigint as client_addresses_count
),
not_valid_constraints as (
  select
    conrelid::regclass::text as table_name,
    conname,
    pg_get_constraintdef(oid) as definition
  from pg_constraint
  where connamespace = 'public'::regnamespace
    and convalidated = false
),
checks as (
  select
    10 as sort_order,
    'expected_repaired_function_signatures_security_and_grants' as check_name,
    count(*) filter (where issue is not null)::integer as issue_count,
    coalesce(jsonb_agg(detail || jsonb_build_object('issue', issue) order by signature) filter (where issue is not null), '[]'::jsonb) as details
  from expected_issues

  union all

  select
    20,
    'obsolete_hold_overload_execute_permissions_removed',
    count(*)::integer,
    coalesce(jsonb_agg(detail order by signature), '[]'::jsonb)
  from absent_issues

  union all

  select
    30,
    'no_unrelated_hold_overloads_removed_or_added',
    count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object('function_name', function_name, 'arguments', arguments) order by function_name, arguments), '[]'::jsonb)
  from unexpected_hold_overloads

  union all

  select
    40,
    'affected_tables_still_exist',
    count(*) filter (where table_oid is null)::integer,
    coalesce(jsonb_agg(jsonb_build_object('table_name', table_name, 'exists', table_oid is not null) order by table_name), '[]'::jsonb)
  from affected_tables

  union all

  select
    50,
    'affected_table_record_counts_observable',
    0,
    to_jsonb(affected_table_counts)
  from affected_table_counts

  union all

  select
    60,
    'not_valid_constraints_unchanged_expected_count',
    case when count(*) = 12 then 0 else 1 end,
    jsonb_build_object(
      'expected_not_valid_constraint_count', 12,
      'actual_not_valid_constraint_count', count(*),
      'constraints', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'table_name', table_name,
            'constraint_name', conname,
            'definition', definition
          )
          order by table_name, conname
        ),
        '[]'::jsonb
      )
    )
  from not_valid_constraints
)
select
  check_name,
  case when issue_count = 0 then 'PASS' else 'REVIEW' end as status,
  issue_count,
  case
    when issue_count = 0 and details = '[]'::jsonb then jsonb_build_object('message', 'No issues found.')
    else details
  end as details
from checks
order by sort_order;
