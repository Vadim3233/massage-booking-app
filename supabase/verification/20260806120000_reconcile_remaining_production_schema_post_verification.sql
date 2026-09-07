-- Read-only post-verification for 20260806120000_reconcile_remaining_production_schema.sql.

with
expected_functions as (
  select *
  from (
    values
      (10, 'public.cancel_recent_booking_request(uuid, text)', true, false, true, true, 'public'),
      (20, 'public.link_telegram_chat_to_booking(jsonb)', true, false, true, true, 'public, pg_temp'),
      (30, 'public.cancel_client_booking(uuid)', true, false, false, true, 'public'),
      (40, 'public.create_admin_personal_event(jsonb)', true, false, false, true, 'public'),
      (50, 'public.current_user_is_booking_admin()', true, false, false, true, 'public'),
      (60, 'public.update_secure_booking(jsonb)', true, false, false, true, 'public, pg_temp'),
      (70, 'public.get_public_booking_blocks(date, date)', true, false, true, true, 'public, pg_temp')
  ) as functions(sort_order, signature, security_definer_expected, public_expected, anon_expected, authenticated_expected, search_path_expected)
),
function_state as (
  select
    expected_functions.*,
    to_regprocedure(signature) as oid
  from expected_functions
),
function_checks as (
  select
    sort_order,
    signature as check_name,
    case
      when function_state.oid is null then 'REVIEW'
      when p.prosecdef is distinct from security_definer_expected then 'REVIEW'
      when has_function_privilege('public', function_state.oid, 'EXECUTE') is distinct from public_expected then 'REVIEW'
      when has_function_privilege('anon', function_state.oid, 'EXECUTE') is distinct from anon_expected then 'REVIEW'
      when has_function_privilege('authenticated', function_state.oid, 'EXECUTE') is distinct from authenticated_expected then 'REVIEW'
      when coalesce(array_to_string(p.proconfig, ','), '') not like '%' || 'search_path=' || search_path_expected || '%' then 'REVIEW'
      else 'PASS'
    end as status,
    jsonb_build_object(
      'exists', function_state.oid is not null,
      'security_definer', p.prosecdef,
      'function_config', p.proconfig,
      'public_can_execute', case when function_state.oid is null then null else has_function_privilege('public', function_state.oid, 'EXECUTE') end,
      'anon_can_execute', case when function_state.oid is null then null else has_function_privilege('anon', function_state.oid, 'EXECUTE') end,
      'authenticated_can_execute', case when function_state.oid is null then null else has_function_privilege('authenticated', function_state.oid, 'EXECUTE') end
    )::text as details
  from function_state
  left join pg_proc p on p.oid = function_state.oid
),
availability as (
  select
    to_regprocedure('public.get_public_booking_blocks(date, date)') as oid
),
availability_check as (
  select
    100 as sort_order,
    'availability_hold_aware_behaviour' as check_name,
    case
      when oid is null then 'REVIEW'
      when pg_get_functiondef(oid) like '%from public.booking_holds%'
        and pg_get_functiondef(oid) like '%public.booking_app_notes_json(b.notes)%'
        and pg_get_functiondef(oid) like '%h.expires_at > now()%'
        and pg_get_functiondef(oid) like '%h.released_at is null%' then 'PASS'
      else 'REVIEW'
    end as status,
    jsonb_build_object(
      'exists', oid is not null,
      'uses_booking_holds', case when oid is null then null else pg_get_functiondef(oid) like '%from public.booking_holds%' end,
      'uses_safe_notes_parser', case when oid is null then null else pg_get_functiondef(oid) like '%public.booking_app_notes_json(b.notes)%' end,
      'filters_expired_holds', case when oid is null then null else pg_get_functiondef(oid) like '%h.expires_at > now()%' end,
      'filters_released_holds', case when oid is null then null else pg_get_functiondef(oid) like '%h.released_at is null%' end
    )::text as details
  from availability
),
telegram_table as (
  select to_regclass('public.client_telegram_links') as oid
),
telegram_checks as (
  select
    200 as sort_order,
    'client_telegram_links_table_security' as check_name,
    case
      when (select oid from telegram_table) is null then 'REVIEW'
      when not coalesce((select relrowsecurity from pg_class where oid = (select oid from telegram_table)), false) then 'REVIEW'
      when has_table_privilege('anon', (select oid from telegram_table), 'SELECT') then 'REVIEW'
      when not has_table_privilege('authenticated', (select oid from telegram_table), 'SELECT') then 'REVIEW'
      when not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'client_telegram_links'
          and policyname = 'Booking admins can read telegram links'
      ) then 'REVIEW'
      else 'PASS'
    end as status,
    jsonb_build_object(
      'exists', (select oid from telegram_table) is not null,
      'rls_enabled', coalesce((select relrowsecurity from pg_class where oid = (select oid from telegram_table)), false),
      'anon_select', case when (select oid from telegram_table) is null then null else has_table_privilege('anon', (select oid from telegram_table), 'SELECT') end,
      'authenticated_select', case when (select oid from telegram_table) is null then null else has_table_privilege('authenticated', (select oid from telegram_table), 'SELECT') end,
      'admin_policy_exists', exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'client_telegram_links'
          and policyname = 'Booking admins can read telegram links'
      )
    )::text as details
),
index_checks as (
  select
    300 as sort_order,
    'client_telegram_links_indexes' as check_name,
    case
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
          select 1
          from pg_indexes
          where schemaname = 'public'
            and tablename = 'client_telegram_links'
            and pg_indexes.indexname = expected.indexname
        )
      ) then 'REVIEW'
      else 'PASS'
    end as status,
    jsonb_build_object(
      'indexes', coalesce((
        select jsonb_agg(indexname order by indexname)
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'client_telegram_links'
      ), '[]'::jsonb)
    )::text as details
)
select check_name, status, details
from function_checks

union all

select check_name, status, details
from availability_check

union all

select check_name, status, details
from telegram_checks

union all

select check_name, status, details
from index_checks
order by check_name;
