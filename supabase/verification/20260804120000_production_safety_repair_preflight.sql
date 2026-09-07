-- Read-only preflight checks for 20260804120000_production_safety_repair.sql.
-- Run this complete file before applying the repair migration.
-- It returns one unified result table and does not alter production data.

with
duplicate_booking_payment_ids as (
  select
    payment_id,
    count(*)::integer as duplicate_count,
    array_agg(id order by created_at desc) as booking_ids
  from public.bookings
  where nullif(trim(coalesce(payment_id, '')), '') is not null
  group by payment_id
  having count(*) > 1
),
duplicate_order_payment_ids as (
  select
    payment_id,
    count(*)::integer as duplicate_count,
    array_agg(id order by created_at desc) as order_ids
  from public.orders
  where nullif(trim(coalesce(payment_id, '')), '') is not null
  group by payment_id
  having count(*) > 1
),
duplicate_booking_references as (
  select
    public.booking_reference_from_notes(notes) as booking_reference,
    count(*)::integer as duplicate_count,
    array_agg(id order by created_at desc) as booking_ids
  from public.bookings
  where public.booking_reference_from_notes(notes) is not null
  group by public.booking_reference_from_notes(notes)
  having count(*) > 1
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
booking_duration_violations as (
  select
    id,
    date,
    start_minutes,
    duration_minutes,
    status,
    payment_status
  from public.bookings
  where duration_minutes is null
     or duration_minutes not in (60, 90, 120, 150, 180, 210, 240)
),
booking_time_boundary_violations as (
  select
    id,
    date,
    start_minutes,
    end_minutes,
    duration_minutes,
    status,
    payment_status
  from public.bookings
  where start_minutes is null
     or start_minutes < 0
     or start_minutes >= 1440
     or end_minutes is null
     or end_minutes <= start_minutes
     or end_minutes > 2880
),
booking_hold_duration_violations as (
  select
    id,
    date,
    start_minutes,
    duration_minutes,
    buffer_minutes,
    expires_at,
    released_at
  from public.booking_holds
  where duration_minutes is null
     or duration_minutes not in (60, 90, 120, 150, 180, 210, 240)
     or buffer_minutes is null
     or buffer_minutes < 0
     or buffer_minutes > 240
),
booking_hold_time_boundary_violations as (
  select
    id,
    date,
    start_minutes,
    duration_minutes,
    buffer_minutes,
    expires_at,
    released_at
  from public.booking_holds
  where start_minutes is null
     or start_minutes < 0
     or start_minutes >= 1440
     or start_minutes + duration_minutes > 1440
     or start_minutes + duration_minutes + buffer_minutes > 1680
),
legacy_plain_text_notes as (
  select
    id,
    left(notes, 120) as notes_preview
  from public.bookings
  where notes is not null
    and trim(notes) <> ''
    and notes !~ '^\s*[\{\[]'
  order by created_at desc
  limit 100
),
hold_functions as (
  select
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    p.prosecdef as security_definer,
    p.proconfig as function_config,
    has_function_privilege('public', p.oid, 'EXECUTE') as public_can_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('create_booking_hold', 'release_booking_hold')
),
legacy_hold_permissions as (
  select *
  from hold_functions
  where (
      function_name = 'create_booking_hold'
      and arguments = 'hold_date date, hold_start_minutes integer, hold_duration_minutes integer, hold_buffer_minutes integer'
    )
    or (
      function_name = 'release_booking_hold'
      and arguments = 'release_hold_id uuid, release_hold_token uuid'
    )
),
modern_hold_permissions as (
  select *
  from hold_functions
  where (
      function_name = 'create_booking_hold'
      and arguments = 'hold_date date, hold_start_minutes integer, hold_duration_minutes integer, hold_buffer_minutes integer, hold_client_key text'
    )
    or (
      function_name = 'release_booking_hold'
      and arguments = 'release_hold_id uuid, release_hold_token uuid, release_client_key text'
    )
),
modern_hold_permission_issues as (
  select *
  from modern_hold_permissions
  where security_definer is distinct from true
     or public_can_execute is distinct from false
     or anon_can_execute is distinct from true
     or authenticated_can_execute is distinct from true
),
missing_modern_hold_functions as (
  select expected.function_name, expected.arguments
  from (
    values
      ('create_booking_hold', 'hold_date date, hold_start_minutes integer, hold_duration_minutes integer, hold_buffer_minutes integer, hold_client_key text'),
      ('release_booking_hold', 'release_hold_id uuid, release_hold_token uuid, release_client_key text')
  ) as expected(function_name, arguments)
  where not exists (
    select 1
    from modern_hold_permissions actual
    where actual.function_name = expected.function_name
      and actual.arguments = expected.arguments
  )
),
checks as (
  select
    10 as sort_order,
    'duplicate_non_empty_bookings_payment_id' as check_name,
    count(*)::integer as issue_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'payment_id', payment_id,
          'duplicate_count', duplicate_count,
          'booking_ids', booking_ids
        )
        order by duplicate_count desc, payment_id
      ),
      '[]'::jsonb
    ) as details
  from duplicate_booking_payment_ids

  union all

  select
    20,
    'duplicate_non_empty_orders_payment_id',
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'payment_id', payment_id,
          'duplicate_count', duplicate_count,
          'order_ids', order_ids
        )
        order by duplicate_count desc, payment_id
      ),
      '[]'::jsonb
    )
  from duplicate_order_payment_ids

  union all

  select
    30,
    'duplicate_booking_references',
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'booking_reference', booking_reference,
          'duplicate_count', duplicate_count,
          'booking_ids', booking_ids
        )
        order by duplicate_count desc, booking_reference
      ),
      '[]'::jsonb
    )
  from duplicate_booking_references

  union all

  select
    40,
    'not_valid_public_constraints',
    count(*)::integer,
    coalesce(
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
  from not_valid_constraints

  union all

  select
    50,
    'booking_duration_constraint_violations',
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'date', date,
          'start_minutes', start_minutes,
          'duration_minutes', duration_minutes,
          'status', status,
          'payment_status', payment_status
        )
        order by date desc nulls last, id
      ),
      '[]'::jsonb
    )
  from booking_duration_violations

  union all

  select
    60,
    'booking_time_boundary_violations',
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'date', date,
          'start_minutes', start_minutes,
          'end_minutes', end_minutes,
          'duration_minutes', duration_minutes,
          'status', status,
          'payment_status', payment_status
        )
        order by date desc nulls last, id
      ),
      '[]'::jsonb
    )
  from booking_time_boundary_violations

  union all

  select
    70,
    'booking_hold_duration_or_buffer_violations',
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'date', date,
          'start_minutes', start_minutes,
          'duration_minutes', duration_minutes,
          'buffer_minutes', buffer_minutes,
          'expires_at', expires_at,
          'released_at', released_at
        )
        order by date desc nulls last, id
      ),
      '[]'::jsonb
    )
  from booking_hold_duration_violations

  union all

  select
    80,
    'booking_hold_time_boundary_violations',
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'date', date,
          'start_minutes', start_minutes,
          'duration_minutes', duration_minutes,
          'buffer_minutes', buffer_minutes,
          'expires_at', expires_at,
          'released_at', released_at
        )
        order by date desc nulls last, id
      ),
      '[]'::jsonb
    )
  from booking_hold_time_boundary_violations

  union all

  select
    90,
    'legacy_plain_text_booking_notes',
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'notes_preview', notes_preview
        )
      ),
      '[]'::jsonb
    )
  from legacy_plain_text_notes

  union all

  select
    100,
    'obsolete_hold_function_permissions',
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'function_name', function_name,
          'arguments', arguments,
          'security_definer', security_definer,
          'public_can_execute', public_can_execute,
          'anon_can_execute', anon_can_execute,
          'authenticated_can_execute', authenticated_can_execute,
          'function_config', function_config
        )
        order by function_name, arguments
      ),
      '[]'::jsonb
    )
  from legacy_hold_permissions
  where public_can_execute or anon_can_execute or authenticated_can_execute

  union all

  select
    110,
    'modern_hold_function_permission_issues',
    (select count(*)::integer from modern_hold_permission_issues)
      + (select count(*)::integer from missing_modern_hold_functions),
    (
      select jsonb_build_object(
        'missing_modern_functions',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'function_name', function_name,
                'arguments', arguments
              )
              order by function_name, arguments
            )
            from missing_modern_hold_functions
          ),
          '[]'::jsonb
        ),
        'permission_or_security_issues',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'function_name', function_name,
                'arguments', arguments,
                'security_definer', security_definer,
                'public_can_execute', public_can_execute,
                'anon_can_execute', anon_can_execute,
                'authenticated_can_execute', authenticated_can_execute,
                'function_config', function_config
              )
              order by function_name, arguments
            )
            from modern_hold_permission_issues
          ),
          '[]'::jsonb
        )
      )
    )
)
select
  check_name,
  case when issue_count = 0 then 'PASS' else 'REVIEW' end as status,
  issue_count,
  case
    when issue_count = 0 then jsonb_build_object('message', 'No issues found.')
    else details
  end as details
from checks
order by sort_order;
