-- Read-only preflight for 20260806120000_reconcile_remaining_production_schema.sql.
-- Returns one result table and does not mutate schema, data, constraints, or history.

with
function_state as (
  select
    signature,
    to_regprocedure(signature) as oid
  from (
    values
      ('public.cancel_recent_booking_request(uuid, text)'),
      ('public.link_telegram_chat_to_booking(jsonb)'),
      ('public.cancel_client_booking(uuid)'),
      ('public.create_admin_personal_event(jsonb)'),
      ('public.current_user_is_booking_admin()'),
      ('public.update_secure_booking(jsonb)'),
      ('public.get_public_booking_blocks(date, date)')
  ) as functions(signature)
),
availability as (
  select
    oid,
    case when oid is null then null else pg_get_functiondef(oid) end as definition
  from function_state
  where signature = 'public.get_public_booking_blocks(date, date)'
),
telegram_table as (
  select
    to_regclass('public.client_telegram_links') as oid
),
telegram_columns as (
  select column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'client_telegram_links'
),
telegram_indexes as (
  select indexname
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'client_telegram_links'
),
checks as (
  select
    10 as sort_order,
    'client_telegram_links_table' as check_name,
    case when (select oid from telegram_table) is null then 'REQUIRED' else 'NOT_REQUIRED' end as status,
    jsonb_build_object('exists', (select oid from telegram_table) is not null)::text as details

  union all

  select
    20,
    'client_telegram_links_columns',
    case
      when (select oid from telegram_table) is null then 'REQUIRED'
      when exists (
        select 1
        from (
          values
            ('id'), ('booking_id'), ('booking_reference'), ('client_email'), ('client_phone'),
            ('chat_id'), ('chat_type'), ('telegram_user_id'), ('telegram_username'),
            ('telegram_first_name'), ('telegram_last_name'), ('is_active'), ('linked_at'), ('last_seen_at')
        ) as expected(column_name)
        where not exists (
          select 1 from telegram_columns where telegram_columns.column_name = expected.column_name
        )
      ) then 'REVIEW'
      else 'NOT_REQUIRED'
    end,
    jsonb_build_object(
      'existing_columns', coalesce((select jsonb_agg(column_name order by column_name) from telegram_columns), '[]'::jsonb)
    )::text

  union all

  select
    30,
    'client_telegram_links_rls',
    case
      when (select oid from telegram_table) is null then 'REQUIRED'
      when exists (
        select 1
        from pg_class
        where oid = (select oid from telegram_table)
          and relrowsecurity
      ) then 'NOT_REQUIRED'
      else 'REQUIRED'
    end,
    jsonb_build_object(
      'rls_enabled', coalesce((select relrowsecurity from pg_class where oid = (select oid from telegram_table)), false)
    )::text

  union all

  select
    40,
    'client_telegram_links_policy',
    case
      when (select oid from telegram_table) is null then 'REQUIRED'
      when exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'client_telegram_links'
          and policyname = 'Booking admins can read telegram links'
      ) then 'NOT_REQUIRED'
      else 'REQUIRED'
    end,
    jsonb_build_object(
      'policy_exists', exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'client_telegram_links'
          and policyname = 'Booking admins can read telegram links'
      )
    )::text

  union all

  select
    50,
    'client_telegram_links_indexes',
    case
      when (select oid from telegram_table) is null then 'REQUIRED'
      when exists (
        select 1
        from (
          values
            ('client_telegram_links_chat_id_unique'),
            ('client_telegram_links_booking_reference_idx'),
            ('client_telegram_links_client_email_idx'),
            ('client_telegram_links_client_phone_idx')
        ) as expected(indexname)
        where not exists (
          select 1 from telegram_indexes where telegram_indexes.indexname = expected.indexname
        )
      ) then 'REQUIRED'
      else 'NOT_REQUIRED'
    end,
    jsonb_build_object(
      'existing_indexes', coalesce((select jsonb_agg(indexname order by indexname) from telegram_indexes), '[]'::jsonb)
    )::text

  union all

  select
    60,
    'cancel_recent_booking_request_signature',
    case when to_regprocedure('public.cancel_recent_booking_request(uuid, text)') is null then 'REQUIRED' else 'NOT_REQUIRED' end,
    jsonb_build_object('exists', to_regprocedure('public.cancel_recent_booking_request(uuid, text)') is not null)::text

  union all

  select
    70,
    'link_telegram_chat_to_booking_signature',
    case when to_regprocedure('public.link_telegram_chat_to_booking(jsonb)') is null then 'REQUIRED' else 'NOT_REQUIRED' end,
    jsonb_build_object('exists', to_regprocedure('public.link_telegram_chat_to_booking(jsonb)') is not null)::text

  union all

  select
    80,
    'availability_hold_aware_definition',
    case
      when (select oid from availability) is null then 'REQUIRED'
      when (select definition from availability) not like '%from public.booking_holds%'
        or (select definition from availability) not like '%public.booking_app_notes_json(b.notes)%' then 'REQUIRED'
      else 'NOT_REQUIRED'
    end,
    jsonb_build_object(
      'exists', (select oid from availability) is not null,
      'uses_booking_holds', coalesce((select definition from availability) like '%from public.booking_holds%', false),
      'uses_safe_notes_parser', coalesce((select definition from availability) like '%public.booking_app_notes_json(b.notes)%', false)
    )::text

  union all

  select
    90 + row_number() over (order by signature),
    signature || '_anon_execute',
    case
      when oid is null then 'REVIEW'
      when has_function_privilege('anon', oid, 'EXECUTE') then 'REQUIRED'
      else 'NOT_REQUIRED'
    end,
    jsonb_build_object(
      'exists', oid is not null,
      'anon_can_execute', case when oid is null then null else has_function_privilege('anon', oid, 'EXECUTE') end,
      'authenticated_can_execute', case when oid is null then null else has_function_privilege('authenticated', oid, 'EXECUTE') end
    )::text
  from function_state
  where signature in (
    'public.cancel_client_booking(uuid)',
    'public.create_admin_personal_event(jsonb)',
    'public.current_user_is_booking_admin()',
    'public.update_secure_booking(jsonb)'
  )
)
select
  check_name,
  status,
  details
from checks
order by sort_order;
