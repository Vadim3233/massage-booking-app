-- Read-only verification for 20260718120000_reconcile_live_production_schema.sql.
--
-- Run this manually after applying the reconciliation migration.
-- Capture pre-apply row counts separately first, then compare them with the
-- row-count section here to confirm existing rows remain present.
-- This script must not create, update, delete, alter, repair, or deploy anything.

select
  'row_count_snapshot' as check_group,
  table_name,
  row_count
from (
  select 'admin_users' as table_name, count(*)::bigint as row_count from public.admin_users
  union all select 'orders', count(*)::bigint from public.orders
  union all select 'bookings', count(*)::bigint from public.bookings
  union all select 'booking_holds', count(*)::bigint from public.booking_holds
  union all select 'client_profiles', count(*)::bigint from public.client_profiles
  union all select 'client_addresses', count(*)::bigint from public.client_addresses
  union all select 'client_preferences', count(*)::bigint from public.client_preferences
  union all select 'session_preferences', count(*)::bigint from public.session_preferences
) counts
order by table_name;

with expected_tables(table_name) as (
  values
    ('admin_users'),
    ('orders'),
    ('bookings'),
    ('booking_holds'),
    ('client_profiles'),
    ('client_addresses'),
    ('client_preferences'),
    ('session_preferences')
)
select
  'required_tables_and_rls' as check_group,
  expected_tables.table_name,
  (tables.tablename is not null) as present,
  tables.rowsecurity as rls_enabled
from expected_tables
left join pg_tables as tables
  on tables.schemaname = 'public'
 and tables.tablename = expected_tables.table_name
order by expected_tables.table_name;

with expected_columns(table_name, column_name, data_type) as (
  values
    ('orders', 'user_id', 'uuid'),
    ('bookings', 'user_id', 'uuid'),
    ('bookings', 'saved_address_id', 'uuid'),
    ('bookings', 'selected_services', 'jsonb'),
    ('bookings', 'selected_durations', 'jsonb'),
    ('bookings', 'payment_status', 'text'),
    ('bookings', 'cancelled_at', 'timestamp with time zone'),
    ('bookings', 'cancelled_by', 'text'),
    ('bookings', 'cancellation_window', 'text'),
    ('bookings', 'updated_at', 'timestamp with time zone'),
    ('booking_holds', 'client_key', 'text'),
    ('booking_holds', 'released_at', 'timestamp with time zone'),
    ('client_profiles', 'user_id', 'uuid'),
    ('client_profiles', 'full_name', 'text'),
    ('client_profiles', 'email', 'text'),
    ('client_profiles', 'phone', 'text'),
    ('client_profiles', 'created_at', 'timestamp with time zone'),
    ('client_profiles', 'updated_at', 'timestamp with time zone'),
    ('client_addresses', 'id', 'uuid'),
    ('client_addresses', 'user_id', 'uuid'),
    ('client_addresses', 'label', 'text'),
    ('client_addresses', 'address_line_1', 'text'),
    ('client_addresses', 'address_line_2', 'text'),
    ('client_addresses', 'city', 'text'),
    ('client_addresses', 'postcode', 'text'),
    ('client_addresses', 'area', 'text'),
    ('client_addresses', 'instructions', 'text'),
    ('client_addresses', 'is_default', 'boolean'),
    ('client_addresses', 'created_at', 'timestamp with time zone'),
    ('client_addresses', 'updated_at', 'timestamp with time zone'),
    ('client_preferences', 'user_id', 'uuid'),
    ('client_preferences', 'preferred_service_ids', 'jsonb'),
    ('client_preferences', 'preferred_durations', 'jsonb'),
    ('client_preferences', 'preferred_address_id', 'uuid'),
    ('client_preferences', 'usual_area', 'text'),
    ('client_preferences', 'usual_notes', 'text'),
    ('client_preferences', 'last_booking_id', 'uuid'),
    ('client_preferences', 'favorite_selection', 'jsonb'),
    ('client_preferences', 'recent_booking_combinations', 'jsonb'),
    ('client_preferences', 'favorite_combination', 'jsonb'),
    ('client_preferences', 'recent_combinations', 'jsonb'),
    ('client_preferences', 'created_at', 'timestamp with time zone'),
    ('client_preferences', 'updated_at', 'timestamp with time zone'),
    ('session_preferences', 'id', 'uuid'),
    ('session_preferences', 'label', 'text'),
    ('session_preferences', 'category', 'text'),
    ('session_preferences', 'is_visible', 'boolean'),
    ('session_preferences', 'sort_order', 'integer'),
    ('session_preferences', 'conflict_ids', 'ARRAY'),
    ('session_preferences', 'deleted_at', 'timestamp with time zone'),
    ('session_preferences', 'created_at', 'timestamp with time zone'),
    ('session_preferences', 'updated_at', 'timestamp with time zone')
)
select
  'required_columns' as check_group,
  expected_columns.table_name,
  expected_columns.column_name,
  expected_columns.data_type as expected_type,
  columns.data_type as actual_type,
  columns.is_nullable,
  columns.column_default,
  (columns.column_name is not null) as present
from expected_columns
left join information_schema.columns as columns
  on columns.table_schema = 'public'
 and columns.table_name = expected_columns.table_name
 and columns.column_name = expected_columns.column_name
order by expected_columns.table_name, expected_columns.column_name;

select
  'payment_status_null_check' as check_group,
  count(*)::bigint as null_payment_status_rows
from public.bookings
where payment_status is null;

with expected_functions(function_name, identity_arguments) as (
  values
    ('current_user_is_booking_admin', ''),
    ('set_updated_at', ''),
    ('sync_client_preference_aliases', ''),
    ('validate_client_preferred_address', ''),
    ('booking_reference_from_notes', 'booking_notes text'),
    ('cleanup_expired_booking_holds', ''),
    ('create_booking_hold', 'hold_date date, hold_start_minutes integer, hold_duration_minutes integer, hold_buffer_minutes integer, hold_client_key text'),
    ('release_booking_hold', 'release_hold_id uuid, release_hold_token uuid, release_client_key text'),
    ('create_secure_order', 'order_payload jsonb'),
    ('create_secure_booking', 'booking_payload jsonb'),
    ('update_secure_booking', 'booking_payload jsonb'),
    ('create_admin_personal_event', 'booking_payload jsonb'),
    ('link_recent_guest_booking_to_client', 'link_payload jsonb'),
    ('reschedule_client_booking', 'booking_id uuid, new_date date, new_start_minutes integer'),
    ('cancel_client_booking', 'booking_id uuid'),
    ('set_session_preferences_updated_at', '')
)
select
  'required_functions' as check_group,
  expected_functions.function_name,
  expected_functions.identity_arguments,
  (procedures.proname is not null) as present,
  procedures.prosecdef as security_definer,
  procedures.provolatile as volatility,
  procedures.proconfig as function_settings
from expected_functions
left join pg_proc as procedures
  on procedures.pronamespace = 'public'::regnamespace
 and procedures.proname = expected_functions.function_name
 and pg_get_function_identity_arguments(procedures.oid) = expected_functions.identity_arguments
order by expected_functions.function_name;

with expected_triggers(table_name, trigger_name) as (
  values
    ('client_profiles', 'set_client_profiles_updated_at'),
    ('client_addresses', 'set_client_addresses_updated_at'),
    ('client_preferences', 'set_client_preferences_updated_at'),
    ('client_preferences', 'sync_client_preference_aliases'),
    ('client_preferences', 'validate_client_preferred_address'),
    ('session_preferences', 'set_session_preferences_updated_at')
)
select
  'required_triggers' as check_group,
  expected_triggers.table_name,
  expected_triggers.trigger_name,
  (triggers.tgname is not null) as present,
  not triggers.tgisinternal as user_trigger,
  pg_get_triggerdef(triggers.oid) as definition
from expected_triggers
left join pg_trigger as triggers
  on triggers.tgrelid = ('public.' || expected_triggers.table_name)::regclass
 and triggers.tgname = expected_triggers.trigger_name
order by expected_triggers.table_name, expected_triggers.trigger_name;

with expected_indexes(index_name) as (
  values
    ('bookings_user_id_created_at_idx'),
    ('bookings_guest_email_created_at_idx'),
    ('bookings_guest_phone_created_at_idx'),
    ('bookings_saved_address_id_idx'),
    ('bookings_order_id_idx'),
    ('bookings_date_start_idx'),
    ('bookings_payment_status_idx'),
    ('orders_user_id_created_at_idx'),
    ('client_profiles_email_idx'),
    ('client_profiles_phone_idx'),
    ('client_addresses_user_id_idx'),
    ('client_addresses_one_default_per_user_idx'),
    ('client_preferences_last_booking_id_idx'),
    ('booking_holds_date_expires_idx'),
    ('booking_holds_client_key_active_idx'),
    ('booking_holds_active_slot_idx'),
    ('session_preferences_sort_order_active_idx'),
    ('session_preferences_visible_sort_idx')
)
select
  'required_indexes' as check_group,
  expected_indexes.index_name,
  (indexes.indexname is not null) as present,
  indexes.tablename,
  indexes.indexdef
from expected_indexes
left join pg_indexes as indexes
  on indexes.schemaname = 'public'
 and indexes.indexname = expected_indexes.index_name
order by expected_indexes.index_name;

with expected_constraints(table_name, constraint_name) as (
  values
    ('bookings', 'bookings_payment_status_check'),
    ('bookings', 'bookings_cancelled_by_check'),
    ('bookings', 'bookings_cancellation_window_check'),
    ('bookings', 'bookings_duration_minutes_check'),
    ('booking_holds', 'booking_holds_duration_minutes_check'),
    ('client_preferences', 'client_preferences_service_ids_are_json_array'),
    ('client_preferences', 'client_preferences_durations_are_json_object'),
    ('client_preferences', 'client_preferences_favorite_selection_is_object'),
    ('client_preferences', 'client_preferences_favorite_combination_is_object'),
    ('client_preferences', 'client_preferences_recent_booking_combinations_are_array'),
    ('client_preferences', 'client_preferences_recent_combinations_are_json_array'),
    ('client_preferences', 'client_preferences_last_booking_id_fkey')
)
select
  'required_constraints' as check_group,
  expected_constraints.table_name,
  expected_constraints.constraint_name,
  (constraints.conname is not null) as present,
  constraints.convalidated as validated,
  pg_get_constraintdef(constraints.oid) as definition
from expected_constraints
left join pg_constraint as constraints
  on constraints.connamespace = 'public'::regnamespace
 and constraints.conrelid = ('public.' || expected_constraints.table_name)::regclass
 and constraints.conname = expected_constraints.constraint_name
order by expected_constraints.table_name, expected_constraints.constraint_name;

with expected_policies(table_name, policy_name, command_name) as (
  values
    ('client_profiles', 'Clients and admins can read own profile', 'SELECT'),
    ('client_profiles', 'Clients and admins can create own profile', 'INSERT'),
    ('client_profiles', 'Clients and admins can update own profile', 'UPDATE'),
    ('client_addresses', 'Clients and admins can read own addresses', 'SELECT'),
    ('client_addresses', 'Clients and admins can create own addresses', 'INSERT'),
    ('client_addresses', 'Clients and admins can update own addresses', 'UPDATE'),
    ('client_addresses', 'Clients and admins can delete own addresses', 'DELETE'),
    ('client_preferences', 'Clients and admins can read own preferences', 'SELECT'),
    ('client_preferences', 'Clients and admins can create own preferences', 'INSERT'),
    ('client_preferences', 'Clients and admins can update own preferences', 'UPDATE'),
    ('bookings', 'Clients and admins can read permitted bookings', 'SELECT'),
    ('bookings', 'Booking admins can update permitted bookings', 'UPDATE'),
    ('bookings', 'Booking admins can delete permitted bookings', 'DELETE'),
    ('orders', 'Clients and admins can read permitted orders', 'SELECT'),
    ('orders', 'Booking admins can update permitted orders', 'UPDATE'),
    ('booking_holds', 'Booking admins can read booking holds', 'SELECT'),
    ('admin_users', 'Booking admins can read admin users', 'SELECT'),
    ('session_preferences', 'Clients can read visible session preferences', 'SELECT'),
    ('session_preferences', 'Booking admins can read all session preferences', 'SELECT'),
    ('session_preferences', 'Booking admins can create session preferences', 'INSERT'),
    ('session_preferences', 'Booking admins can update session preferences', 'UPDATE'),
    ('session_preferences', 'Booking admins can delete session preferences', 'DELETE')
)
select
  'expected_policies' as check_group,
  expected_policies.table_name,
  expected_policies.policy_name,
  expected_policies.command_name,
  (policies.policyname is not null) as present,
  policies.roles,
  policies.qual,
  policies.with_check
from expected_policies
left join pg_policies as policies
  on policies.schemaname = 'public'
 and policies.tablename = expected_policies.table_name
 and policies.policyname = expected_policies.policy_name
 and policies.cmd = expected_policies.command_name
order by expected_policies.table_name, expected_policies.policy_name;

select
  'unexpected_public_private_policies' as check_group,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('bookings', 'orders', 'client_profiles', 'client_addresses', 'client_preferences')
  and (
    'public' = any(roles)
    or 'anon' = any(roles)
    or cmd in ('INSERT', 'UPDATE', 'DELETE')
       and (
         coalesce(qual, '') !~ 'current_user_is_booking_admin|auth\\.uid\\(\\)|user_id'
         and coalesce(with_check, '') !~ 'current_user_is_booking_admin|auth\\.uid\\(\\)|user_id'
       )
  )
order by tablename, policyname;

with expected_grants(table_name, grantee, privilege_type, should_exist) as (
  values
    ('client_profiles', 'authenticated', 'SELECT', true),
    ('client_profiles', 'authenticated', 'INSERT', true),
    ('client_profiles', 'authenticated', 'UPDATE', true),
    ('client_profiles', 'authenticated', 'DELETE', false),
    ('client_profiles', 'anon', 'SELECT', false),
    ('client_addresses', 'authenticated', 'SELECT', true),
    ('client_addresses', 'authenticated', 'INSERT', true),
    ('client_addresses', 'authenticated', 'UPDATE', true),
    ('client_addresses', 'authenticated', 'DELETE', true),
    ('client_addresses', 'anon', 'SELECT', false),
    ('client_preferences', 'authenticated', 'SELECT', true),
    ('client_preferences', 'authenticated', 'INSERT', true),
    ('client_preferences', 'authenticated', 'UPDATE', true),
    ('client_preferences', 'authenticated', 'DELETE', false),
    ('client_preferences', 'anon', 'SELECT', false),
    ('bookings', 'authenticated', 'SELECT', true),
    ('bookings', 'authenticated', 'UPDATE', true),
    ('bookings', 'authenticated', 'DELETE', true),
    ('bookings', 'authenticated', 'INSERT', false),
    ('bookings', 'anon', 'INSERT', false),
    ('orders', 'authenticated', 'SELECT', true),
    ('orders', 'authenticated', 'UPDATE', true),
    ('orders', 'authenticated', 'INSERT', false),
    ('orders', 'anon', 'INSERT', false),
    ('booking_holds', 'authenticated', 'SELECT', true),
    ('booking_holds', 'anon', 'SELECT', false)
)
select
  'expected_table_grants' as check_group,
  expected_grants.table_name,
  expected_grants.grantee,
  expected_grants.privilege_type,
  expected_grants.should_exist,
  (privileges.privilege_type is not null) as actual_exists
from expected_grants
left join information_schema.table_privileges as privileges
  on privileges.table_schema = 'public'
 and privileges.table_name = expected_grants.table_name
 and privileges.grantee = expected_grants.grantee
 and privileges.privilege_type = expected_grants.privilege_type
order by expected_grants.table_name, expected_grants.grantee, expected_grants.privilege_type;

select
  'session_preferences_seed' as check_group,
  count(*)::bigint as default_seed_rows,
  min(sort_order) as min_sort_order,
  max(sort_order) as max_sort_order
from public.session_preferences
where id between '11111111-1111-4111-8111-111111111111'::uuid
             and '11111111-1111-4111-8111-111111111130'::uuid;
