-- Stage 1 only: admission records and RPCs. Existing booking, order, hold,
-- profile RLS and Auth behavior are deliberately unchanged until cutover.
begin;

create extension if not exists pgcrypto;
create schema client_access_private;
revoke all on schema client_access_private from public, anon, authenticated;

alter table public.client_profiles
  add column first_name text check (first_name is null or char_length(first_name) <= 100),
  add column last_name text check (last_name is null or char_length(last_name) <= 100);

create table client_access_private.client_invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  state text not null default 'UNUSED' check (state in ('UNUSED', 'LINKED', 'REVOKED')),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  intended_name text check (char_length(intended_name) <= 200),
  mobile text check (char_length(mobile) <= 40),
  source_note text check (char_length(source_note) <= 500),
  linked_user_id uuid unique references auth.users(id),
  linked_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  check (expires_at > created_at),
  check (
    (state = 'UNUSED' and linked_user_id is null and linked_at is null and revoked_at is null and revoked_by is null)
    or (state = 'LINKED' and linked_user_id is not null and linked_at is not null and revoked_at is null and revoked_by is null)
    or (state = 'REVOKED' and linked_user_id is null and linked_at is null and revoked_at is not null and revoked_by is not null)
  )
);
create index client_invitations_state_expiry_idx on client_access_private.client_invitations(state, expires_at);
create index client_invitations_created_idx on client_access_private.client_invitations(created_at desc);

create table client_access_private.client_access (
  user_id uuid primary key references auth.users(id),
  status text not null check (status in ('ACTIVE', 'BLOCKED')),
  admission_source text not null check (admission_source in ('INVITATION', 'LEGACY_APPROVAL')),
  invitation_id uuid unique references client_access_private.client_invitations(id),
  admitted_at timestamptz not null default clock_timestamp(),
  admitted_by uuid not null references auth.users(id),
  status_changed_at timestamptz not null default clock_timestamp(),
  status_changed_by uuid not null references auth.users(id),
  administrative_reason text check (char_length(administrative_reason) <= 500),
  check ((admission_source = 'INVITATION' and invitation_id is not null)
    or (admission_source = 'LEGACY_APPROVAL' and invitation_id is null))
);
create index client_access_status_idx on client_access_private.client_access(status, admitted_at desc);

-- Structured, bounded events: no arbitrary request payload or token column.
create table client_access_private.client_access_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'INVITATION_CREATED', 'INVITATION_REVOKED', 'INVITATION_LINKED',
    'ACCESS_ACTIVATED', 'CLIENT_BLOCKED', 'CLIENT_UNBLOCKED'
  )),
  user_id uuid references auth.users(id),
  invitation_id uuid references client_access_private.client_invitations(id),
  actor_user_id uuid not null references auth.users(id),
  occurred_at timestamptz not null default clock_timestamp(),
  previous_status text check (previous_status in ('ACTIVE', 'BLOCKED')),
  new_status text check (new_status in ('ACTIVE', 'BLOCKED')),
  reason text check (char_length(reason) <= 500),
  check (user_id is not null or invitation_id is not null)
);
create index client_access_events_user_idx on client_access_private.client_access_events(user_id, occurred_at desc);
create index client_access_events_invitation_idx on client_access_private.client_access_events(invitation_id, occurred_at desc);

alter table client_access_private.client_invitations enable row level security;
alter table client_access_private.client_access enable row level security;
alter table client_access_private.client_access_events enable row level security;
revoke all on all tables in schema client_access_private from public, anon, authenticated;
-- No browser table policies. Only the narrow definer RPCs below may write.

-- pgcrypto may already be installed in public or extensions. Resolve its schema
-- at migration time, rather than trusting a runtime search_path or relocating it.
do $install_random_token$
declare crypto_schema text;
begin
  select n.nspname into strict crypto_schema
  from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';
  execute format($definition$
    create function client_access_private.new_invitation_token() returns text
    language sql volatile set search_path = pg_catalog
    as $body$ select pg_catalog.encode(%I.gen_random_bytes(32), 'hex') $body$
  $definition$, crypto_schema);
end;
$install_random_token$;

create function client_access_private.assert_admin() returns void
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if auth.uid() is null or not coalesce(public.current_user_is_booking_admin(), false) then
    raise exception using errcode = '42501', message = 'Booking admin access is required.';
  end if;
end;
$$;

create function client_access_private.lock_user(target_user_id uuid) returns void
language sql volatile set search_path = pg_catalog
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client-access:' || target_user_id::text, 0));
$$;

create function client_access_private.invitation_state(stored_state text, expiry timestamptz) returns text
language sql volatile set search_path = pg_catalog
as $$
  select case when stored_state = 'UNUSED' and expiry <= clock_timestamp() then 'EXPIRED' else stored_state end;
$$;

create function client_access_private.missing_profile_fields(target_user_id uuid) returns text[]
language sql stable security definer set search_path = pg_catalog
as $$
  select array_remove(array[
    case when nullif(btrim(p.first_name), '') is null then 'first_name' end,
    case when nullif(btrim(p.last_name), '') is null then 'last_name' end,
    case when nullif(btrim(u.email), '') is null or u.email_confirmed_at is null then 'email' end,
    case when regexp_replace(coalesce(p.phone, ''), '[[:space:]().-]', '', 'g') !~ '^\+?[0-9]{7,15}$' then 'mobile' end
  ], null)
  from (select target_user_id as id) identity_row
  left join auth.users u on u.id = identity_row.id
  left join public.client_profiles p on p.user_id = identity_row.id;
$$;

create function public.get_my_client_access() returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  caller uuid := auth.uid();
  access_status text;
  missing text[];
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'A signed-in client is required.';
  end if;
  select a.status into access_status from client_access_private.client_access a where a.user_id = caller;
  missing := client_access_private.missing_profile_fields(caller);
  return jsonb_build_object('status', access_status,
    'profile_complete', cardinality(missing) = 0, 'missing_fields', to_jsonb(missing));
end;
$$;

create function client_access_private.save_profile(caller uuid, profile_fields jsonb) returns void
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  given_name text;
  family_name text;
  mobile_number text;
  confirmed_email text;
begin
  if profile_fields is null or jsonb_typeof(profile_fields) <> 'object' then
    raise exception using errcode = '22023', message = 'Profile fields are required.';
  end if;
  if exists (select 1 from jsonb_object_keys(profile_fields) k where k not in ('first_name', 'last_name', 'mobile', 'email'))
    or jsonb_typeof(profile_fields -> 'first_name') is distinct from 'string'
    or jsonb_typeof(profile_fields -> 'last_name') is distinct from 'string'
    or jsonb_typeof(profile_fields -> 'mobile') is distinct from 'string' then
    raise exception using errcode = '22023', message = 'First name, last name and mobile must be supplied as text.';
  end if;
  given_name := btrim(profile_fields ->> 'first_name');
  family_name := btrim(profile_fields ->> 'last_name');
  mobile_number := regexp_replace(profile_fields ->> 'mobile', '[[:space:]().-]', '', 'g');
  if given_name = '' or char_length(given_name) > 100 or given_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'A valid first name is required.';
  end if;
  if family_name = '' or char_length(family_name) > 100 or family_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'A valid last name is required.';
  end if;
  if char_length(profile_fields ->> 'mobile') > 40 or mobile_number !~ '^\+?[0-9]{7,15}$' then
    raise exception using errcode = '22023', message = 'A valid mobile number is required.';
  end if;
  select nullif(btrim(u.email), '') into confirmed_email from auth.users u
  where u.id = caller and u.email_confirmed_at is not null;
  if confirmed_email is null then
    raise exception using errcode = '42501', message = 'A confirmed email address is required.';
  end if;
  -- Ignore any supplied email: a profile or JWT metadata edit cannot establish it.
  insert into public.client_profiles(user_id, first_name, last_name, full_name, email, phone)
  values (caller, given_name, family_name, given_name || ' ' || family_name, confirmed_email, mobile_number)
  on conflict (user_id) do update set first_name = excluded.first_name, last_name = excluded.last_name,
    full_name = excluded.full_name, email = excluded.email, phone = excluded.phone, updated_at = clock_timestamp();
end;
$$;

create function public.complete_my_client_profile(profile_fields jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare caller uuid := auth.uid();
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'A signed-in client is required.';
  end if;
  perform client_access_private.lock_user(caller);
  if not exists (select 1 from client_access_private.client_access a where a.user_id = caller) then
    raise exception using errcode = '42501', message = 'Client admission is required.';
  end if;
  -- BLOCKED clients may maintain contact details; this never changes access.
  perform client_access_private.save_profile(caller, profile_fields);
  return public.get_my_client_access();
end;
$$;

create function public.admin_create_client_invitation(
  intended_name text default null, mobile text default null, source_note text default null
) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  raw_token text;
  invitation client_access_private.client_invitations%rowtype;
begin
  perform client_access_private.assert_admin();
  if char_length(intended_name) > 200 or char_length(mobile) > 40 or char_length(source_note) > 500 then
    raise exception using errcode = '22023', message = 'Invitation details are too long.';
  end if;
  raw_token := client_access_private.new_invitation_token();
  insert into client_access_private.client_invitations(token_hash, created_by, intended_name, mobile, source_note)
  values (sha256(convert_to(raw_token, 'UTF8')), auth.uid(), nullif(btrim(intended_name), ''),
    nullif(btrim(mobile), ''), nullif(btrim(source_note), '')) returning * into invitation;
  insert into client_access_private.client_access_events(event_type, invitation_id, actor_user_id)
  values ('INVITATION_CREATED', invitation.id, auth.uid());
  -- Token only: the future UI constructs the URL using its trusted public origin.
  return jsonb_build_object('id', invitation.id, 'token', raw_token, 'status', 'UNUSED', 'expires_at', invitation.expires_at);
end;
$$;

create function public.validate_client_invitation(token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  invitation client_access_private.client_invitations%rowtype;
  effective_state text;
begin
  if token is null or token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'INVALID', 'valid', false);
  end if;
  select * into invitation from client_access_private.client_invitations i where i.token_hash = sha256(convert_to(token, 'UTF8'));
  if not found then return jsonb_build_object('status', 'INVALID', 'valid', false); end if;
  effective_state := client_access_private.invitation_state(invitation.state, invitation.expires_at);
  return jsonb_build_object('status', effective_state, 'valid', effective_state = 'UNUSED', 'expires_at', invitation.expires_at);
end;
$$;

create function public.admin_revoke_client_invitation(invitation_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  invitation client_access_private.client_invitations%rowtype;
  effective_state text;
begin
  perform client_access_private.assert_admin();
  select * into invitation from client_access_private.client_invitations i where i.id = invitation_id for update;
  if not found then raise exception using errcode = '22023', message = 'Invitation was not found.'; end if;
  effective_state := client_access_private.invitation_state(invitation.state, invitation.expires_at);
  if effective_state = 'LINKED' then
    raise exception using errcode = '22023', message = 'A linked invitation cannot be revoked. Manage the client access instead.';
  end if;
  if effective_state in ('REVOKED', 'EXPIRED') then
    return jsonb_build_object('id', invitation.id, 'status', effective_state);
  end if;
  update client_access_private.client_invitations i set state = 'REVOKED', revoked_at = clock_timestamp(), revoked_by = auth.uid()
  where i.id = invitation.id;
  insert into client_access_private.client_access_events(event_type, invitation_id, actor_user_id)
  values ('INVITATION_REVOKED', invitation.id, auth.uid());
  return jsonb_build_object('id', invitation.id, 'status', 'REVOKED');
end;
$$;

create function public.accept_client_invitation(token text, profile_fields jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  caller uuid := auth.uid();
  invitation client_access_private.client_invitations%rowtype;
  access_status text;
  effective_state text;
begin
  if caller is null then raise exception using errcode = '42501', message = 'A signed-in client is required.'; end if;
  -- Same per-user lock as block/unblock, including when no access row exists yet.
  -- Lock order is always user first, invitation second. Revocation only locks invitation.
  perform client_access_private.lock_user(caller);
  select a.status into access_status from client_access_private.client_access a where a.user_id = caller for update;
  if access_status = 'BLOCKED' then raise exception using errcode = '42501', message = 'Client access is blocked.'; end if;
  if not exists (select 1 from auth.users u where u.id = caller and u.email_confirmed_at is not null and nullif(btrim(u.email), '') is not null) then
    raise exception using errcode = '42501', message = 'A confirmed email address is required.';
  end if;
  if token is null or token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invitation is invalid.';
  end if;
  select * into invitation from client_access_private.client_invitations i
  where i.token_hash = sha256(convert_to(token, 'UTF8')) for update;
  if not found then raise exception using errcode = '22023', message = 'Invitation is invalid.'; end if;
  effective_state := client_access_private.invitation_state(invitation.state, invitation.expires_at);
  if effective_state = 'LINKED' then
    if invitation.linked_user_id = caller and access_status = 'ACTIVE' then
      return public.get_my_client_access(); -- Retry: no profile overwrite or duplicate audit events.
    end if;
    raise exception using errcode = '42501', message = 'Invitation has already been linked.';
  end if;
  if effective_state <> 'UNUSED' then raise exception using errcode = '22023', message = 'Invitation is no longer available.'; end if;
  if access_status is not null then raise exception using errcode = '22023', message = 'Client is already admitted.'; end if;

  perform client_access_private.save_profile(caller, profile_fields);
  insert into client_access_private.client_access(user_id, status, admission_source, invitation_id, admitted_by, status_changed_by)
  values (caller, 'ACTIVE', 'INVITATION', invitation.id, invitation.created_by, caller);
  update client_access_private.client_invitations i set state = 'LINKED', linked_user_id = caller, linked_at = clock_timestamp()
  where i.id = invitation.id;
  insert into client_access_private.client_access_events(event_type, user_id, invitation_id, actor_user_id, new_status)
  values ('INVITATION_LINKED', caller, invitation.id, caller, null), ('ACCESS_ACTIVATED', caller, invitation.id, caller, 'ACTIVE');
  return public.get_my_client_access();
end;
$$;

create function client_access_private.set_access_status(target_user_id uuid, desired_status text, reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare existing_access client_access_private.client_access%rowtype;
begin
  perform client_access_private.assert_admin();
  if target_user_id is null or desired_status is null or desired_status not in ('ACTIVE', 'BLOCKED') or char_length(reason) > 500 then
    raise exception using errcode = '22023', message = 'Invalid client access request.';
  end if;
  perform client_access_private.lock_user(target_user_id);
  select * into existing_access from client_access_private.client_access a where a.user_id = target_user_id for update;
  if not found then raise exception using errcode = '22023', message = 'Client has not been admitted.'; end if;
  if existing_access.status <> desired_status then
    update client_access_private.client_access a set status = desired_status, status_changed_at = clock_timestamp(),
      status_changed_by = auth.uid(), administrative_reason = nullif(btrim(reason), '') where a.user_id = target_user_id;
    insert into client_access_private.client_access_events(event_type, user_id, actor_user_id, previous_status, new_status, reason)
    values (case when desired_status = 'BLOCKED' then 'CLIENT_BLOCKED' else 'CLIENT_UNBLOCKED' end,
      target_user_id, auth.uid(), existing_access.status, desired_status, nullif(btrim(reason), ''));
  end if;
  return jsonb_build_object('user_id', target_user_id, 'status', desired_status);
end;
$$;

create function public.admin_block_client(target_user_id uuid, reason text default null) returns jsonb
language sql security definer set search_path = pg_catalog
as $$ select client_access_private.set_access_status(target_user_id, 'BLOCKED', reason); $$;

create function public.admin_unblock_client(target_user_id uuid, reason text default null) returns jsonb
language sql security definer set search_path = pg_catalog
as $$ select client_access_private.set_access_status(target_user_id, 'ACTIVE', reason); $$;

revoke all on all functions in schema client_access_private from public, anon, authenticated;
revoke all on function public.admin_create_client_invitation(text, text, text),
  public.admin_revoke_client_invitation(uuid), public.validate_client_invitation(text),
  public.accept_client_invitation(text, jsonb), public.get_my_client_access(),
  public.complete_my_client_profile(jsonb), public.admin_block_client(uuid, text),
  public.admin_unblock_client(uuid, text) from public, anon, authenticated;
grant execute on function public.validate_client_invitation(text) to anon, authenticated;
grant execute on function public.admin_create_client_invitation(text, text, text),
  public.admin_revoke_client_invitation(uuid), public.accept_client_invitation(text, jsonb),
  public.get_my_client_access(), public.complete_my_client_profile(jsonb),
  public.admin_block_client(uuid, text), public.admin_unblock_client(uuid, text) to authenticated;

commit;
