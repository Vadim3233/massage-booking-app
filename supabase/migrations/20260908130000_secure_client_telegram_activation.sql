begin;

create schema if not exists telegram_private;
revoke all on schema telegram_private from public, anon, authenticated;

alter table public.client_telegram_links
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists client_telegram_links_active_user_unique
on public.client_telegram_links(user_id) where user_id is not null and is_active;

create table telegram_private.client_telegram_invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  state text not null default 'UNUSED' check (state in ('UNUSED', 'LINKED', 'REVOKED')),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (clock_timestamp() + interval '7 days'),
  linked_at timestamptz,
  redeemed_chat_id text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  check (expires_at > created_at),
  check (
    (state = 'UNUSED' and linked_at is null and redeemed_chat_id is null and revoked_at is null and revoked_by is null)
    or (state = 'LINKED' and linked_at is not null and redeemed_chat_id is not null and revoked_at is null and revoked_by is null)
    or (state = 'REVOKED' and linked_at is null and redeemed_chat_id is null and revoked_at is not null and revoked_by is not null)
  )
);
create index client_telegram_invitations_user_created_idx
on telegram_private.client_telegram_invitations(user_id, created_at desc);
alter table telegram_private.client_telegram_invitations enable row level security;
revoke all on table telegram_private.client_telegram_invitations from public, anon, authenticated;

create table telegram_private.client_telegram_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('INVITATION_CREATED','INVITATION_REVOKED','TELEGRAM_LINKED','TELEGRAM_DISCONNECTED')),
  user_id uuid not null references auth.users(id) on delete cascade,
  invitation_id uuid references telegram_private.client_telegram_invitations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp()
);
alter table telegram_private.client_telegram_events enable row level security;
revoke all on table telegram_private.client_telegram_events from public, anon, authenticated;

do $install_telegram_token_generator$
declare crypto_schema text;
begin
  select n.nspname into strict crypto_schema
  from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace
  where e.extname='pgcrypto';
  execute format($definition$
    create function telegram_private.new_activation_token() returns text
    language sql volatile set search_path=pg_catalog
    as $body$ select translate(trim(trailing '=' from pg_catalog.encode(%I.gen_random_bytes(32),'base64')), '+/', '-_') $body$
  $definition$, crypto_schema);
end;
$install_telegram_token_generator$;

create function telegram_private.assert_admin() returns void
language plpgsql security definer set search_path = pg_catalog
as $$ begin
  if auth.uid() is null or not coalesce(public.current_user_is_booking_admin(), false) then
    raise exception using errcode='42501', message='Booking admin access is required.';
  end if;
end $$;

create function telegram_private.lock_client(target_user_id uuid) returns void
language sql volatile set search_path = pg_catalog
as $$ select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client-telegram:' || target_user_id::text, 0)) $$;

create function public.admin_get_client_telegram_status(target_user_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare connection public.client_telegram_links%rowtype; invitation telegram_private.client_telegram_invitations%rowtype;
begin
  perform telegram_private.assert_admin();
  select * into connection from public.client_telegram_links l where l.user_id=target_user_id and l.is_active order by l.linked_at desc limit 1;
  select * into invitation from telegram_private.client_telegram_invitations i where i.user_id=target_user_id order by i.created_at desc limit 1;
  if connection.id is not null then
    return jsonb_build_object('state','CONNECTED','username',connection.telegram_username,'linked_at',connection.linked_at);
  end if;
  if invitation.id is not null and invitation.state='UNUSED' and invitation.expires_at > clock_timestamp() then
    return jsonb_build_object('state','PENDING','invitation_id',invitation.id,'created_at',invitation.created_at,'expires_at',invitation.expires_at);
  end if;
  return jsonb_build_object('state','NOT_CONNECTED');
end $$;

create function public.admin_create_client_telegram_invitation(target_user_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare raw_token text; invitation telegram_private.client_telegram_invitations%rowtype;
begin
  perform telegram_private.assert_admin();
  if not exists (select 1 from public.client_profiles p where p.user_id=target_user_id) then
    raise exception using errcode='22023', message='An authenticated client profile is required.';
  end if;
  perform telegram_private.lock_client(target_user_id);
  update telegram_private.client_telegram_invitations i set state='REVOKED', revoked_at=clock_timestamp(), revoked_by=auth.uid()
    where i.user_id=target_user_id and i.state='UNUSED' and i.expires_at > clock_timestamp();
  raw_token := telegram_private.new_activation_token();
  insert into telegram_private.client_telegram_invitations(user_id,token_hash,created_by)
  values(target_user_id,sha256(convert_to(raw_token,'UTF8')),auth.uid()) returning * into invitation;
  insert into telegram_private.client_telegram_events(event_type,user_id,invitation_id,actor_user_id)
  values('INVITATION_CREATED',target_user_id,invitation.id,auth.uid());
  return jsonb_build_object('id',invitation.id,'token','acct_' || raw_token,'state','PENDING','expires_at',invitation.expires_at);
end $$;

create function public.admin_revoke_client_telegram_invitation(invitation_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare invitation telegram_private.client_telegram_invitations%rowtype;
begin
  perform telegram_private.assert_admin();
  select * into invitation from telegram_private.client_telegram_invitations i where i.id=invitation_id;
  if invitation.id is null then raise exception using errcode='22023', message='Invitation was not found.'; end if;
  perform telegram_private.lock_client(invitation.user_id);
  select * into invitation from telegram_private.client_telegram_invitations i where i.id=invitation_id for update;
  if invitation.state='UNUSED' and invitation.expires_at > clock_timestamp() then
    update telegram_private.client_telegram_invitations set state='REVOKED',revoked_at=clock_timestamp(),revoked_by=auth.uid() where id=invitation.id;
    insert into telegram_private.client_telegram_events(event_type,user_id,invitation_id,actor_user_id)
    values('INVITATION_REVOKED',invitation.user_id,invitation.id,auth.uid());
  end if;
  return jsonb_build_object('id',invitation.id,'state',case when invitation.expires_at <= clock_timestamp() then 'EXPIRED' when invitation.state='UNUSED' then 'REVOKED' else invitation.state end);
end $$;

create function public.consume_client_telegram_activation(activation_payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare token text := activation_payload->>'token'; raw_token text; chat text := nullif(btrim(activation_payload->>'chat_id'),''); invitation telegram_private.client_telegram_invitations%rowtype; link public.client_telegram_links%rowtype;
begin
  if activation_payload is null or jsonb_typeof(activation_payload)<>'object' or token !~ '^acct_[A-Za-z0-9_-]{43}$' or chat is null then
    return jsonb_build_object('linked',false,'status','INVALID');
  end if;
  raw_token := substring(token from 6);
  select * into invitation from telegram_private.client_telegram_invitations i where i.token_hash=sha256(convert_to(raw_token,'UTF8'));
  if invitation.id is null then return jsonb_build_object('linked',false,'status','INVALID'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('telegram-chat:' || chat, 0));
  perform telegram_private.lock_client(invitation.user_id);
  select * into invitation from telegram_private.client_telegram_invitations i where i.id=invitation.id for update;
  if invitation.state='LINKED' then
    return jsonb_build_object('linked',invitation.redeemed_chat_id=chat,'status',case when invitation.redeemed_chat_id=chat then 'CONNECTED' else 'INVALID' end);
  end if;
  if invitation.state<>'UNUSED' or invitation.expires_at<=clock_timestamp() then return jsonb_build_object('linked',false,'status','INVALID'); end if;
  if exists(select 1 from public.client_telegram_links l where l.chat_id=chat and l.is_active and l.user_id is not null and l.user_id<>invitation.user_id) then
    return jsonb_build_object('linked',false,'status','INVALID');
  end if;
  update public.client_telegram_links set is_active=false where user_id=invitation.user_id and is_active;
  insert into public.client_telegram_links(booking_reference,chat_id,chat_type,telegram_user_id,telegram_username,telegram_first_name,telegram_last_name,is_active,user_id)
  values('ACCOUNT',chat,nullif(btrim(activation_payload->>'chat_type'),''),nullif(btrim(activation_payload->>'telegram_user_id'),''),
    nullif(btrim(activation_payload->>'username'),''),nullif(btrim(activation_payload->>'first_name'),''),nullif(btrim(activation_payload->>'last_name'),''),true,invitation.user_id)
  on conflict(chat_id) do update set user_id=excluded.user_id,chat_type=excluded.chat_type,telegram_user_id=excluded.telegram_user_id,
    telegram_username=excluded.telegram_username,telegram_first_name=excluded.telegram_first_name,telegram_last_name=excluded.telegram_last_name,
    is_active=true,linked_at=clock_timestamp(),last_seen_at=clock_timestamp() returning * into link;
  update telegram_private.client_telegram_invitations set state='LINKED',linked_at=clock_timestamp(),redeemed_chat_id=chat where id=invitation.id;
  insert into telegram_private.client_telegram_events(event_type,user_id,invitation_id) values('TELEGRAM_LINKED',invitation.user_id,invitation.id);
  return jsonb_build_object('linked',true,'status','CONNECTED');
end $$;

create function public.admin_disconnect_client_telegram(target_user_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare changed integer;
begin
  perform telegram_private.assert_admin(); perform telegram_private.lock_client(target_user_id);
  update public.client_telegram_links set is_active=false,last_seen_at=clock_timestamp() where user_id=target_user_id and is_active;
  get diagnostics changed = row_count;
  update telegram_private.client_telegram_invitations set state='REVOKED',revoked_at=clock_timestamp(),revoked_by=auth.uid()
    where user_id=target_user_id and state='UNUSED' and expires_at>clock_timestamp();
  if changed>0 then insert into telegram_private.client_telegram_events(event_type,user_id,actor_user_id) values('TELEGRAM_DISCONNECTED',target_user_id,auth.uid()); end if;
  return jsonb_build_object('disconnected',changed>0);
end $$;

create function public.get_my_telegram_connection() returns jsonb
language sql stable security definer set search_path = pg_catalog
as $$ select jsonb_build_object('connected',exists(select 1 from public.client_telegram_links l where l.user_id=auth.uid() and l.is_active)) $$;

revoke all on function telegram_private.new_activation_token(), telegram_private.assert_admin(), telegram_private.lock_client(uuid) from public, anon, authenticated;
revoke all on function public.admin_get_client_telegram_status(uuid), public.admin_create_client_telegram_invitation(uuid), public.admin_revoke_client_telegram_invitation(uuid), public.admin_disconnect_client_telegram(uuid), public.consume_client_telegram_activation(jsonb), public.get_my_telegram_connection() from public, anon, authenticated;
grant execute on function public.admin_get_client_telegram_status(uuid), public.admin_create_client_telegram_invitation(uuid), public.admin_revoke_client_telegram_invitation(uuid), public.admin_disconnect_client_telegram(uuid) to authenticated;
grant execute on function public.consume_client_telegram_activation(jsonb) to anon, authenticated;
grant execute on function public.get_my_telegram_connection() to authenticated;

commit;
