import { readFile } from "node:fs/promises";

export const migrationUrl = new URL("../../../supabase/migrations/20260907120000_client_access_invitation_foundation.sql", import.meta.url);
export const migrationSql = await readFile(migrationUrl, "utf8");
const reconciliation = await readFile(new URL("../../../supabase/migrations/20260718120000_reconcile_live_production_schema.sql", import.meta.url), "utf8");
const foundation = await readFile(new URL("../../../supabase/migrations/20260606120000_returning_client_foundation.sql", import.meta.url), "utf8");
const adminFunction = reconciliation.slice(reconciliation.indexOf("create or replace function public.current_user_is_booking_admin()"), reconciliation.indexOf("create or replace function public.set_updated_at()"));
const profileTable = foundation.match(/create table if not exists public\.client_profiles \([\s\S]*?\n\);/)[0];
const profilePolicies = reconciliation.slice(reconciliation.indexOf('create policy "Clients and admins can read own profile"'), reconciliation.indexOf('create policy "Clients and admins can read own addresses"'));

export const adminId = "00000000-0000-4000-8000-000000000001";
export const adminEmail = "admin@example.test";
export const validProfile = { first_name: "Jo", last_name: "Client", mobile: "+44 7700 900123" };

// Standalone local fixture. No credentials, environment URLs or remote clients.
// Reuse the repository's actual admin boundary, profile definition and policies.
export function fixtureSql(cryptoSchema = "extensions") {
  if (!["extensions", "public"].includes(cryptoSchema)) throw new Error("Unexpected extension schema");
  return `
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create schema extensions;
    create extension pgcrypto with schema ${cryptoSchema};
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable set search_path = pg_catalog
      as $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable set search_path = pg_catalog
      as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    grant usage on schema auth to anon, authenticated;
    create table public.admin_users (email text primary key);
    insert into auth.users values ('${adminId}', '${adminEmail}', now());
    insert into public.admin_users values ('${adminEmail}');
    ${adminFunction}
    ${profileTable}
    alter table public.client_profiles enable row level security;
    grant select, insert, update on public.client_profiles to authenticated;
    ${profilePolicies}
    -- Stand-ins prove this additive migration does not revoke existing booking RPCs.
    create function public.create_secure_booking(jsonb) returns boolean language sql as $$ select true $$;
    create function public.create_secure_order(jsonb) returns boolean language sql as $$ select true $$;
    create function public.create_booking_hold(date, integer, integer, integer, text) returns boolean language sql as $$ select true $$;
    revoke all on function public.create_secure_booking(jsonb), public.create_secure_order(jsonb),
      public.create_booking_hold(date, integer, integer, integer, text) from public;
    grant execute on function public.create_secure_booking(jsonb), public.create_secure_order(jsonb),
      public.create_booking_hold(date, integer, integer, integer, text) to anon, authenticated;
  `;
}
