-- Final read-only schema and migration reconciliation audit.
--
-- Run this complete file in Supabase SQL Editor and export the full result as CSV.
-- It reads catalog metadata and aggregate table counts only. It does not call
-- booking RPCs, mutate data, validate constraints, or alter migration history.

with
local_migrations as (
  select *
  from (
    values
      (10, '20260606120000', '20260606120000_returning_client_foundation.sql', 'historical_local_migration'),
      (20, '20260606143000', '20260606143000_book_again_preferences.sql', 'historical_local_migration'),
      (30, '20260606170000', '20260606170000_private_data_security_hardening.sql', 'historical_local_migration'),
      (40, '20260606210000', '20260606210000_rebuild_client_security.sql', 'historical_local_migration'),
      (50, '20260610', '20260610_duration_constraint.sql', 'historical_local_migration'),
      (60, '20260619123000', '20260619123000_restore_update_secure_booking.sql', 'historical_local_migration'),
      (70, '20260622162000', '20260622162000_create_admin_personal_event.sql', 'historical_local_migration'),
      (80, '20260703120000', '20260703120000_link_recent_guest_booking_to_client.sql', 'historical_local_migration'),
      (90, '20260704120000', '20260704120000_reschedule_client_booking.sql', 'historical_local_migration'),
      (100, '20260704130000', '20260704130000_add_cancellation_history_fields.sql', 'historical_local_migration'),
      (110, '20260704133000', '20260704133000_cancel_client_booking.sql', 'historical_local_migration'),
      (120, '20260713120000', '20260713120000_add_booking_hold_rpcs.sql', 'historical_local_migration'),
      (130, '20260713130000', '20260713130000_enforce_client_booking_limits.sql', 'historical_local_migration'),
      (140, '20260713140000', '20260713140000_harden_secure_booking_updates.sql', 'historical_local_migration'),
      (150, '20260713150000', '20260713150000_create_session_preferences.sql', 'historical_local_migration'),
      (160, '20260718120000', '20260718120000_reconcile_live_production_schema.sql', 'historical_reconciliation_migration'),
      (170, '20260720130000', '20260720130000_cancel_recent_booking_request.sql', 'historical_local_migration'),
      (180, '20260731120000', '20260731120000_link_telegram_chats_to_bookings.sql', 'historical_local_migration'),
      (190, '20260731140000', '20260731140000_align_public_availability_with_holds.sql', 'historical_local_migration'),
      (200, '20260804120000', '20260804120000_production_safety_repair.sql', 'manually_applied_and_expected_recorded'),
      (210, '20260804123000', '20260804123000_fix_production_safety_repair_permissions.sql', 'manually_applied_and_expected_recorded'),
      (220, '20260804124500', '20260804124500_remove_remaining_anon_function_grants.sql', 'manually_applied_and_expected_recorded'),
      (230, '20260804130000', '20260804130000_remove_helper_authenticated_function_grants.sql', 'uncertain_manual_application'),
      (240, '20260806120000', '20260806120000_reconcile_remaining_production_schema.sql', 'manually_applied_and_expected_recorded')
  ) as migrations(sort_order, version, filename, local_classification)
),
recorded_migrations as (
  select version::text as version
  from supabase_migrations.schema_migrations
),
expected_functions as (
  select *
  from (
    values
      (10, 'public.current_user_is_booking_admin()', 'admin auth boundary', true, false, false, true, true, 'public', 'src/supabaseClient.js rpc current_user_is_booking_admin; 20260718120000 keeps authenticated grant'),
      (20, 'public.booking_app_notes_json(text)', 'private notes parser used by repaired SECURITY DEFINER functions', false, false, false, false, false, 'public, pg_temp', '20260804120000 helper; 20260804130000 removes direct authenticated execution'),
      (30, 'public.booking_reference_from_notes(text)', 'private booking-reference parser used by repaired functions', false, false, false, false, false, 'public, pg_temp', '20260804120000 helper; 20260804130000 removes direct authenticated execution'),
      (40, 'public.get_public_booking_blocks(date, date)', 'public availability metadata for client Date and Time step', true, false, true, true, true, 'public, pg_temp', 'src/App.jsx rpc get_public_booking_blocks; 20260804123000 grants anon and authenticated only'),
      (50, 'public.create_booking_hold(date, integer, integer, integer, text)', 'modern client-key booking hold creation', true, false, true, true, true, 'public, pg_temp', 'src/App.jsx rpc create_booking_hold with hold_client_key; legacy overloads removed'),
      (60, 'public.release_booking_hold(uuid, uuid, text)', 'modern client-key booking hold release', true, false, true, true, true, 'public, pg_temp', 'src/App.jsx rpc release_booking_hold with release_client_key; legacy overloads removed'),
      (70, 'public.create_secure_order(jsonb)', 'order row creation with client-safe payment status and untrusted client amount ignored', true, false, true, true, true, 'public, pg_temp', 'src/App.jsx rpc create_secure_order; 20260804120000 repairs body and 20260804123000 grants anon and authenticated'),
      (80, 'public.reschedule_client_booking(uuid, date, integer)', 'signed-in client reschedule RPC', true, false, false, true, true, 'public, pg_temp', 'src/lib/clientData.js rpc reschedule_client_booking; 20260804124500 removes anon and preserves authenticated'),
      (90, 'public.link_recent_guest_booking_to_client(jsonb)', 'signed-in client guest booking ownership link', true, false, false, true, true, 'public, pg_temp', 'src/lib/clientData.js rpc link_recent_guest_booking_to_client; 20260804124500 removes anon and preserves authenticated'),
      (100, 'public.cancel_client_booking(uuid)', 'signed-in client cancellation RPC', true, false, false, true, true, 'public', 'src/lib/clientData.js rpc cancel_client_booking; 20260718120000 keeps authenticated grant'),
      (110, 'public.cancel_recent_booking_request(uuid, text)', 'recent guest cancellation request from confirmation page', true, false, true, true, true, 'public', 'src/lib/bookingSupabase.js rpc cancel_recent_booking_request; 20260720130000 grants anon and authenticated'),
      (120, 'public.create_secure_booking(jsonb)', 'validated booking creation', true, false, true, true, true, 'public, pg_temp', 'src/lib/bookingSupabase.js rpc create_secure_booking; 20260718120000 grants anon and authenticated'),
      (130, 'public.update_secure_booking(jsonb)', 'admin booking update RPC', true, false, false, true, true, 'public, pg_temp', 'src/lib/bookingSupabase.js rpc update_secure_booking; 20260718120000 grants authenticated'),
      (140, 'public.create_admin_personal_event(jsonb)', 'admin personal calendar block creation', true, false, false, true, true, 'public', 'src/lib/bookingSupabase.js rpc create_admin_personal_event; 20260718120000 grants authenticated'),
      (150, 'public.link_telegram_chat_to_booking(jsonb)', 'Telegram bot booking-reference link endpoint', true, false, true, true, true, 'public, pg_temp', 'server/telegramWebhook.js rpc link_telegram_chat_to_booking; 20260731120000 grants anon and authenticated'),
      (160, 'public.cleanup_expired_booking_holds()', 'supporting hold cleanup RPC', false, false, true, true, true, 'public, pg_temp', '20260713120000 and 20260718120000 grant anon and authenticated')
  ) as functions(sort_order, signature, purpose, called_directly_by_application, public_execute_expected, anon_execute_expected, authenticated_execute_expected, security_definer_expected, expected_search_path, repository_evidence)
),
resolved_functions as (
  select
    expected_functions.*,
    to_regprocedure(expected_functions.signature) as function_oid
  from expected_functions
),
function_catalog as (
  select
    resolved_functions.*,
    proc.oid as oid,
    owner_role.rolname as owner_name,
    proc.prosecdef as security_definer_actual,
    proc.proconfig as function_config,
    coalesce(array_to_string(proc.proconfig, ','), '') as function_config_text,
    exists (
      select 1
      from aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) as acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) as public_execute_actual,
    exists (
      select 1
      from aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) as acl
      where acl.grantee = to_regrole('anon')
        and acl.privilege_type = 'EXECUTE'
    ) as anon_execute_direct_actual,
    coalesce(has_function_privilege(to_regrole('anon'), proc.oid, 'EXECUTE'), false) as anon_execute_actual,
    exists (
      select 1
      from aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) as acl
      where acl.grantee = to_regrole('authenticated')
        and acl.privilege_type = 'EXECUTE'
    ) as authenticated_execute_direct_actual,
    coalesce(has_function_privilege(to_regrole('authenticated'), proc.oid, 'EXECUTE'), false) as authenticated_execute_actual
  from resolved_functions
  left join pg_proc proc on proc.oid = resolved_functions.function_oid
  left join pg_roles owner_role on owner_role.oid = proc.proowner
),
helper_permission_effect as (
  select
    bool_and(function_oid is not null and authenticated_execute_actual is false) as helper_authenticated_execution_removed,
    bool_and(function_oid is not null and anon_execute_actual is false) as helper_anon_execution_removed,
    bool_and(function_oid is not null and public_execute_actual is false) as helper_public_execution_removed
  from function_catalog
  where signature in (
    'public.booking_app_notes_json(text)',
    'public.booking_reference_from_notes(text)'
  )
),
legacy_hold_overloads as (
  select *
  from (
    values
      ('public.create_booking_hold(date, integer, integer, integer)'),
      ('public.release_booking_hold(uuid, uuid)')
  ) as overloads(signature)
),
hold_overloads as (
  select
    p.oid,
    p.proname as function_name,
    n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' as signature,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) as public_execute_actual,
    exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where acl.grantee = to_regrole('anon')
        and acl.privilege_type = 'EXECUTE'
    ) as anon_execute_direct_actual,
    coalesce(has_function_privilege(to_regrole('anon'), p.oid, 'EXECUTE'), false) as anon_execute_actual,
    exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where acl.grantee = to_regrole('authenticated')
        and acl.privilege_type = 'EXECUTE'
    ) as authenticated_execute_direct_actual,
    coalesce(has_function_privilege(to_regrole('authenticated'), p.oid, 'EXECUTE'), false) as authenticated_execute_actual
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('create_booking_hold', 'release_booking_hold')
),
affected_tables as (
  select *
  from (
    values
      (10, 'public.bookings', true, 'required booking table used by booking, hold, availability, payment, reschedule, and admin flows'),
      (20, 'public.orders', true, 'required order table used by create_secure_order and payment verification flows'),
      (30, 'public.booking_holds', true, 'required hold table used by modern client-key hold RPCs and public availability'),
      (40, 'public.client_profiles', true, 'actual returning-client profile table created by client security migrations'),
      (50, 'public.client_addresses', true, 'actual saved-address table used by client account and repaired booking/linking RPCs'),
      (60, 'public.client_preferences', true, 'actual returning-client preferences table created by client security migrations'),
      (70, 'public.client_telegram_links', true, 'actual Telegram link table created by 20260731120000_link_telegram_chats_to_bookings.sql'),
      (80, 'public.clients', false, 'not created by local migrations and not queried by application code; included to document the previous audit mistake'),
      (90, 'public.telegram_chat_links', false, 'not created by local migrations; actual table is public.client_telegram_links')
  ) as tables(sort_order, table_name, expected_to_exist, repository_evidence)
),
affected_table_metadata as (
  select
    affected_tables.*,
    to_regclass(affected_tables.table_name) as table_oid,
    case
      when to_regclass(affected_tables.table_name) is null then null::bigint
      else pg_total_relation_size(to_regclass(affected_tables.table_name))
    end as total_relation_bytes,
    pg_class.reltuples::bigint as estimated_row_count,
    pg_class.relkind as relation_kind
  from affected_tables
  left join pg_class on pg_class.oid = to_regclass(affected_tables.table_name)
),
not_valid_constraints as (
  select
    conrelid::regclass::text as table_name,
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as definition
  from pg_constraint
  where connamespace = 'public'::regnamespace
    and convalidated = false
),
function_checks as (
  select
    1000 + sort_order as sort_order,
    'function_signature_security_and_grants' as category,
    signature as object_name,
    'expected_function_state' as check_name,
    jsonb_build_object(
      'exists', true,
      'public_execute', public_execute_expected,
      'anon_execute', anon_execute_expected,
      'authenticated_execute', authenticated_execute_expected,
      'security_definer', security_definer_expected,
      'search_path', expected_search_path
    )::text as expected_state,
    jsonb_build_object(
      'exists', oid is not null,
      'owner', owner_name,
      'public_direct_execute', public_execute_actual,
      'public_effective_execute', public_execute_actual,
      'anon_direct_execute', anon_execute_direct_actual,
      'anon_effective_execute', anon_execute_actual,
      'authenticated_direct_execute', authenticated_execute_direct_actual,
      'authenticated_effective_execute', authenticated_execute_actual,
      'security_definer', security_definer_actual,
      'function_config', function_config
    )::text as actual_state,
    case
      when oid is null then 'BLOCKER'
      when public_execute_actual is distinct from public_execute_expected then 'BLOCKER'
      when anon_execute_actual is distinct from anon_execute_expected then 'BLOCKER'
      when authenticated_execute_actual is distinct from authenticated_execute_expected then 'BLOCKER'
      when security_definer_actual is distinct from security_definer_expected then 'BLOCKER'
      when expected_search_path is not null
        and function_config_text not like '%' || 'search_path=' || expected_search_path || '%' then 'BLOCKER'
      else 'MATCHED'
    end as status,
    jsonb_build_object(
      'purpose', purpose,
      'called_directly_by_application', called_directly_by_application,
      'repository_evidence', repository_evidence
    )::text as details
  from function_catalog
),
migration_checks as (
  select
    sort_order,
    'migration_history' as category,
    filename as object_name,
    'version_record_presence' as check_name,
    local_classification as expected_state,
    case when recorded_migrations.version is null then 'not_recorded' else 'recorded' end as actual_state,
    case
      when local_migrations.version = '20260804130000'
        and recorded_migrations.version is not null then 'MATCHED'
      when local_migrations.version = '20260804130000'
        and recorded_migrations.version is null
        and (select helper_authenticated_execution_removed from helper_permission_effect) is true
        and (select helper_anon_execution_removed from helper_permission_effect) is true
        and (select helper_public_execution_removed from helper_permission_effect) is true then 'UNCERTAIN'
      when local_migrations.version = '20260804130000'
        and recorded_migrations.version is null then 'GENUINELY_PENDING'
      when local_migrations.version = '20260806120000'
        and recorded_migrations.version is not null then 'MATCHED'
      when local_migrations.version = '20260806120000'
        and recorded_migrations.version is null then 'HISTORICAL_MISMATCH'
      when local_classification = 'manually_applied_and_expected_recorded'
        and recorded_migrations.version is not null then 'MATCHED'
      when local_classification = 'manually_applied_and_expected_recorded'
        and recorded_migrations.version is null then 'HISTORICAL_MISMATCH'
      when recorded_migrations.version is not null then 'MATCHED'
      else 'HISTORICAL_MISMATCH'
    end as status,
    jsonb_build_object(
      'version', local_migrations.version,
      'local_classification', local_classification,
      'interpretation',
        case
          when local_migrations.version = '20260804130000'
            and recorded_migrations.version is null
            and (select helper_authenticated_execution_removed from helper_permission_effect) is true
            then 'helper privileges match the intended final effect, but this does not prove the SQL file was the cause'
          when local_migrations.version = '20260804130000'
            and recorded_migrations.version is null
            then 'history is missing and helper privileges do not yet prove final intended state'
          when local_classification like 'historical%'
            and recorded_migrations.version is null
            then 'older history mismatch; do not apply or mark blindly'
          else 'compare with expected project state'
        end
    )::text as details
  from local_migrations
  left join recorded_migrations on recorded_migrations.version = local_migrations.version
),
legacy_hold_checks as (
  select
    2000 + row_number() over (order by legacy_hold_overloads.signature) as sort_order,
    'obsolete_hold_overload_absence' as category,
    legacy_hold_overloads.signature as object_name,
    'legacy_overload_absent_or_not_client_executable' as check_name,
    'obsolete overload absent; no PUBLIC, anon, or authenticated execution' as expected_state,
    jsonb_build_object(
      'exists', hold_overloads.oid is not null,
      'public_direct_execute', hold_overloads.public_execute_actual,
      'public_effective_execute', hold_overloads.public_execute_actual,
      'anon_direct_execute', hold_overloads.anon_execute_direct_actual,
      'anon_effective_execute', hold_overloads.anon_execute_actual,
      'authenticated_direct_execute', hold_overloads.authenticated_execute_direct_actual,
      'authenticated_effective_execute', hold_overloads.authenticated_execute_actual
    )::text as actual_state,
    case
      when hold_overloads.oid is null then 'MATCHED'
      when hold_overloads.public_execute_actual is false
        and hold_overloads.anon_execute_actual is false
        and hold_overloads.authenticated_execute_actual is false then 'OBSOLETE'
      else 'BLOCKER'
    end as status,
    '20260804120000 drops the legacy overloads; supported application flow uses client-key overloads only.' as details
  from legacy_hold_overloads
  left join hold_overloads on hold_overloads.signature = legacy_hold_overloads.signature
),
unexpected_hold_overload_checks as (
  select
    2100 + row_number() over (order by signature) as sort_order,
    'unexpected_hold_overloads' as category,
    signature as object_name,
    'only_modern_hold_signatures_expected' as check_name,
    'only public.create_booking_hold(date, integer, integer, integer, text) and public.release_booking_hold(uuid, uuid, text)' as expected_state,
    jsonb_build_object(
      'identity_arguments', identity_arguments,
      'public_direct_execute', public_execute_actual,
      'public_effective_execute', public_execute_actual,
      'anon_direct_execute', anon_execute_direct_actual,
      'anon_effective_execute', anon_execute_actual,
      'authenticated_direct_execute', authenticated_execute_direct_actual,
      'authenticated_effective_execute', authenticated_execute_actual
    )::text as actual_state,
    'UNCERTAIN' as status,
    'An unexpected hold overload exists. Review before applying, marking, or reverting any migration.' as details
  from hold_overloads
  where signature not in (
    'public.create_booking_hold(date, integer, integer, integer, text)',
    'public.release_booking_hold(uuid, uuid, text)',
    'public.create_booking_hold(date, integer, integer, integer)',
    'public.release_booking_hold(uuid, uuid)'
  )
),
affected_table_checks as (
  select
    3000 + sort_order as sort_order,
    'affected_table_presence' as category,
    table_name as object_name,
    'table_exists' as check_name,
    'table exists; aggregate metadata only' as expected_state,
    jsonb_build_object(
      'exists', table_oid is not null,
      'expected_to_exist', expected_to_exist,
      'relation_kind', relation_kind,
      'total_relation_bytes', total_relation_bytes,
      'estimated_row_count', estimated_row_count
    )::text as actual_state,
    case
      when expected_to_exist and table_oid is null then 'BLOCKER'
      when expected_to_exist and table_oid is not null then 'MATCHED'
      when not expected_to_exist and table_oid is null then 'MATCHED'
      else 'UNCERTAIN'
    end as status,
    jsonb_build_object(
      'repository_evidence', repository_evidence,
      'privacy_note', 'Only catalog metadata is returned. No client records, notes, addresses, names, emails, phone numbers, or payment identifiers are returned.'
    )::text as details
  from affected_table_metadata
),
not_valid_constraint_check as (
  select
    4000 as sort_order,
    'not_valid_constraints' as category,
    'public schema constraints' as object_name,
    'existing_not_valid_constraint_state' as check_name,
    'observe only; do not validate constraints during this reconciliation' as expected_state,
    jsonb_build_object(
      'not_valid_constraint_count', count(*),
      'constraints', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'table_name', table_name,
            'constraint_name', constraint_name,
            'constraint_type', constraint_type,
            'definition', definition
          )
          order by table_name, constraint_name
        ),
        '[]'::jsonb
      )
    )::text as actual_state,
    'MATCHED' as status,
    'This check reports the current metadata state only. A count other than the expected production preflight count should be reviewed, but this audit never validates constraints.' as details
  from not_valid_constraints
),
helper_effect_check as (
  select
    5000 as sort_order,
    '20260804130000_live_effect' as category,
    'private helper functions' as object_name,
    'helper_client_role_execution_removed' as check_name,
    'PUBLIC=false, anon=false, authenticated=false for booking_app_notes_json(text) and booking_reference_from_notes(text)' as expected_state,
    jsonb_build_object(
      'helper_public_execution_removed', helper_public_execution_removed,
      'helper_anon_execution_removed', helper_anon_execution_removed,
      'helper_authenticated_execution_removed', helper_authenticated_execution_removed
    )::text as actual_state,
    case
      when helper_public_execution_removed
        and helper_anon_execution_removed
        and helper_authenticated_execution_removed then 'MATCHED'
      else 'GENUINELY_PENDING'
    end as status,
    'If this effect is MATCHED but migration history lacks 20260804130000, the database state is correct but the cause/history remains uncertain.' as details
  from helper_permission_effect
)
select
  category,
  object_name,
  check_name,
  expected_state,
  actual_state,
  status,
  details
from migration_checks

union all

select
  category,
  object_name,
  check_name,
  expected_state,
  actual_state,
  status,
  details
from function_checks

union all

select
  category,
  object_name,
  check_name,
  expected_state,
  actual_state,
  status,
  details
from legacy_hold_checks

union all

select
  category,
  object_name,
  check_name,
  expected_state,
  actual_state,
  status,
  details
from unexpected_hold_overload_checks

union all

select
  category,
  object_name,
  check_name,
  expected_state,
  actual_state,
  status,
  details
from affected_table_checks

union all

select
  category,
  object_name,
  check_name,
  expected_state,
  actual_state,
  status,
  details
from not_valid_constraint_check

union all

select
  category,
  object_name,
  check_name,
  expected_state,
  actual_state,
  status,
  details
from helper_effect_check
order by category, object_name, check_name;
