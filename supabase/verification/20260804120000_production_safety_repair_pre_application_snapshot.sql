-- Read-only pre-application snapshot for 20260804120000_production_safety_repair.sql.
-- Run before applying the repair migration and save/export the result.
-- The output captures enough function metadata to verify or construct rollback.

with expected_functions(signature) as (
  values
    ('public.booking_app_notes_json(text)'::text),
    ('public.booking_reference_from_notes(text)'::text),
    ('public.get_public_booking_blocks(date, date)'::text),
    ('public.reschedule_client_booking(uuid, date, integer)'::text),
    ('public.link_recent_guest_booking_to_client(jsonb)'::text),
    ('public.create_secure_order(jsonb)'::text),
    ('public.create_booking_hold(date, integer, integer, integer)'::text),
    ('public.create_booking_hold(date, integer, integer, integer, text)'::text),
    ('public.release_booking_hold(uuid, uuid)'::text),
    ('public.release_booking_hold(uuid, uuid, text)'::text)
),
resolved_functions as (
  select
    expected.signature,
    to_regprocedure(expected.signature) as function_oid
  from expected_functions expected
),
function_metadata as (
  select
    resolved.signature,
    resolved.function_oid,
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type,
    l.lanname as language_name,
    pg_get_userbyid(p.proowner) as owner_name,
    p.prosecdef as security_definer,
    p.provolatile as volatility_code,
    case p.provolatile
      when 'i' then 'immutable'
      when 's' then 'stable'
      when 'v' then 'volatile'
      else p.provolatile::text
    end as volatility,
    p.proparallel as parallel_code,
    p.proleakproof as leakproof,
    p.proisstrict as strict,
    p.proconfig as function_config,
    p.proacl as function_acl,
    has_function_privilege('public', p.oid, 'EXECUTE') as public_can_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
    pg_get_functiondef(p.oid) as function_definition
  from resolved_functions resolved
  left join pg_proc p on p.oid = resolved.function_oid
  left join pg_namespace n on n.oid = p.pronamespace
  left join pg_language l on l.oid = p.prolang
)
select
  signature,
  case when function_oid is null then 'MISSING' else 'PRESENT' end as status,
  function_oid::text as oid_at_snapshot,
  schema_name,
  function_name,
  arguments,
  result_type,
  language_name,
  owner_name,
  security_definer,
  volatility,
  parallel_code,
  leakproof,
  strict,
  function_config,
  function_acl,
  public_can_execute,
  anon_can_execute,
  authenticated_can_execute,
  function_definition
from function_metadata
order by signature;
