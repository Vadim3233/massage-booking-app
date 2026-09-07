# Supabase Migration Deployment Runbook

This runbook is for applying the local booking-security migrations to staging or production Supabase. It does not contain secrets and should be used with test accounts and non-real client data first.

## A. Backup and Preparation

1. Confirm the exact Supabase project before applying anything.
2. Apply to staging first whenever a staging project is available.
3. Create or verify a current database backup before the migration window.
4. Confirm no client is actively completing a booking during the migration window.
5. Do not paste service-role keys, JWT secrets, database passwords, or private environment values into tickets, chat, or this repository.
6. Confirm the application code being tested is the code that calls the secure RPCs:
   - `create_booking_hold`
   - `release_booking_hold`
   - `create_secure_booking`
   - `update_secure_booking`
   - `cancel_client_booking`
   - `reschedule_client_booking`
7. Keep the current production database unchanged until staging has passed the verification checklist.

## B. Exact Migration Order

Apply all earlier tracked migrations first if the target project does not already have them. The migrations below are the local untracked/dependency set discovered during audit and should be applied in chronological order.

| Order | Migration | Purpose | Dependencies | Expected success result | Rollback or recovery |
| --- | --- | --- | --- | --- | --- |
| 1 | `20260619123000_restore_update_secure_booking.sql` | Restores the admin booking update RPC before later hardening replaces it. | Base booking tables, `current_user_is_booking_admin`. | `public.update_secure_booking(jsonb)` exists for authenticated users. | If it fails, stop and verify base security migrations and booking columns. Do not disable RLS. |
| 2 | `20260622162000_create_admin_personal_event.sql` | Adds admin-only personal event creation. | Bookings table and admin authorization RPC. | `public.create_admin_personal_event(jsonb)` exists for authenticated users. | If it fails, confirm required booking columns exist before retrying. |
| 3 | `20260703120000_link_recent_guest_booking_to_client.sql` | Allows authenticated clients to link a recent guest booking by reference. | Client tables, bookings table, `booking_reference_from_notes`. | `public.link_recent_guest_booking_to_client(jsonb)` exists for authenticated users. | If it fails, confirm reference helper and client tables exist. |
| 4 | `20260704120000_reschedule_client_booking.sql` | Adds narrow client-owned rescheduling RPC. | Bookings table, client ownership columns, admin helper. | `public.reschedule_client_booking(uuid, date, integer)` exists for authenticated users. | If it fails, leave app on old code path and inspect ownership columns. |
| 5 | `20260704130000_add_cancellation_history_fields.sql` | Adds cancellation audit fields. | Bookings table. | `cancelled_at`, `cancelled_by`, and `cancellation_window` exist on `public.bookings`. | If it fails midway, inspect `information_schema.columns`; rerun only after confirming partial columns. |
| 6 | `20260704133000_cancel_client_booking.sql` | Adds narrow client-owned cancellation RPC. | Cancellation history fields, bookings table, auth ownership. | `public.cancel_client_booking(uuid)` exists for authenticated users. | If it fails, do not grant table updates to clients; fix the RPC dependency. |
| 7 | `20260713120000_add_booking_hold_rpcs.sql` | Adds anonymous-safe short booking holds and cleanup. | `public.booking_holds`, `public.bookings`, `pgcrypto`/`gen_random_uuid`. | Hold columns/indexes exist; hold RPCs return hold ID, token, and authoritative expiry. | If it fails, do not let the client flow rely on holds; inspect missing table/column/extension. |
| 8 | `20260713130000_enforce_client_booking_limits.sql` | Replaces `create_secure_booking` with hold consumption, booking limits, 40-day window, conflict checks, and identity locking. | Hold RPC/table columns, client tables, bookings table, order table, `booking_reference_from_notes`. | `public.create_secure_booking(jsonb)` enforces limits and consumes valid holds. | If it fails, stop before production traffic. Restore from backup if partial application corrupted the function. |
| 9 | `20260713140000_harden_secure_booking_updates.sql` | Replaces `update_secure_booking` as admin-only and removes the need for direct table update fallback. | Cancellation fields, bookings table, order/client address tables, admin helper. | `public.update_secure_booking(jsonb)` persists payment status and cancellation metadata; anonymous execute is not granted. | If admin edits fail after this, inspect RPC existence/signature/permissions. Do not add direct client table updates. |

The July 13 order matters:

1. Hold RPCs first, so frontend holds exist.
2. Booking limits second, so `create_secure_booking` can validate and consume holds.
3. Secure updates third, so admin payment/cash/cancellation edits remain behind the hardened RPC. This migration does not replace or weaken `create_secure_booking`.

## C. Safe Application Method

### Supabase CLI Workflow

Use this only when the local project is linked to the correct Supabase project.

1. Confirm project link:

```bash
supabase status
```

2. Review pending migrations:

```bash
supabase migration list
```

3. Apply to staging first:

```bash
supabase db push
```

4. Run the post-migration read-only verification queries below.
5. Repeat for production only after staging passes.

Do not use commands that reset, repair, or wipe the remote database unless a separate approved recovery plan exists.

### SQL Editor Workflow

Use this only when applying manually.

1. Open the Supabase SQL Editor for the correct project.
2. Apply one migration file at a time in the exact order above.
3. After each file, confirm success before moving to the next file.
4. If a file fails, stop. Do not continue with later migrations.
5. Save the SQL error text privately for diagnosis, without exposing secrets.
6. Run the post-migration read-only verification queries below.

Do not combine all files into one large paste for production unless staging has already proven that exact combined script.

## D. Post-Migration Verification Queries

These queries are read-only.

### Required Functions and Signatures

```sql
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  p.proconfig as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_booking_hold',
    'release_booking_hold',
    'cleanup_expired_booking_holds',
    'create_secure_booking',
    'update_secure_booking',
    'cancel_client_booking',
    'reschedule_client_booking',
    'create_admin_personal_event',
    'link_recent_guest_booking_to_client'
  )
order by p.proname, arguments;
```

Expected key signatures:

```text
create_booking_hold(hold_date date, hold_start_minutes integer, hold_duration_minutes integer, hold_buffer_minutes integer, hold_client_key text)
release_booking_hold(release_hold_id uuid, release_hold_token uuid, release_client_key text)
cleanup_expired_booking_holds()
create_secure_booking(booking_payload jsonb)
update_secure_booking(booking_payload jsonb)
cancel_client_booking(booking_id uuid)
reschedule_client_booking(booking_id uuid, new_date date, new_start_minutes integer)
```

Security-definer functions should include a safe `search_path` in `function_config`.

### Execute Permissions

```sql
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  role_name,
  has_function_privilege(role_name, p.oid, 'EXECUTE') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as roles(role_name)
where n.nspname = 'public'
  and p.proname in (
    'create_booking_hold',
    'release_booking_hold',
    'cleanup_expired_booking_holds',
    'create_secure_booking',
    'update_secure_booking',
    'cancel_client_booking',
    'reschedule_client_booking'
  )
order by p.proname, arguments, role_name;
```

Expected:

- `anon`: can execute hold RPCs and `create_secure_booking`.
- `anon`: cannot execute `update_secure_booking`, `cancel_client_booking`, or `reschedule_client_booking`.
- `authenticated`: can execute the above RPCs as intended, with admin/client checks inside the functions.

### RLS Remains Enabled

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'bookings',
    'booking_holds',
    'orders',
    'client_profiles',
    'client_addresses',
    'client_preferences',
    'admin_users'
  )
order by tablename;
```

Expected: `rowsecurity = true` for all listed private tables.

### Booking Hold Columns Exist

```sql
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'booking_holds'
  and column_name in (
    'id',
    'hold_token',
    'client_key',
    'date',
    'start_minutes',
    'duration_minutes',
    'buffer_minutes',
    'expires_at',
    'released_at',
    'created_at'
  )
order by ordinal_position;
```

Expected: `client_key` and `released_at` exist, and `expires_at` exists.

### Required Constraints

```sql
select
  conrelid::regclass as table_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.bookings'::regclass, 'public.booking_holds'::regclass)
  and (
    conname ilike '%duration%'
    or conname ilike '%cancel%'
  )
order by table_name::text, conname;
```

Expected: duration constraints allow supported durations, and cancellation metadata constraints allow only expected values.

### No Duplicate Active Booking References

```sql
select
  public.booking_reference_from_notes(notes) as booking_reference,
  count(*) as duplicate_count
from public.bookings
where public.booking_reference_from_notes(notes) is not null
  and lower(coalesce(status, 'confirmed')) not in (
    'cancelled',
    'canceled',
    'expired',
    'rejected',
    'refunded'
  )
group by public.booking_reference_from_notes(notes)
having count(*) > 1
order by duplicate_count desc, booking_reference;
```

Expected: no rows.

### Active Hold Cleanup Visibility

```sql
select
  count(*) filter (where expires_at <= now()) as expired_holds,
  count(*) filter (where released_at is not null) as released_holds,
  count(*) filter (where expires_at > now() and released_at is null) as active_holds
from public.booking_holds;
```

Expected: active holds may exist briefly during testing; old expired/released rows can be cleaned by `cleanup_expired_booking_holds()`.

## E. Live Smoke-Test Checklist

Use test accounts and non-real client data.

1. Create a booking hold from the client Date & Time step.
2. Release that hold by changing time or leaving the selection.
3. As a new guest/client, create the first active future booking successfully.
4. With the same guest/client identity, attempt a second active future booking and confirm it is blocked.
5. Mark a historical appointment for that same client as both `completed` and `paid` in staging/admin workflow.
6. Confirm the returning client can create up to five future bookings.
7. Confirm the sixth active future booking is blocked.
8. Confirm a date beyond 40 calendar days is blocked for normal client booking.
9. Complete the bank-transfer client action and confirm the booking is `awaiting_verification`, not `paid`.
10. As admin, verify payment and confirm the booking becomes confirmed and paid.
11. Request cash, approve it as admin, and confirm payment remains `cash_on_arrival`.
12. Reject a cash request and confirm the booking is cancelled and no longer blocks the slot.
13. Edit an appointment as admin and confirm `update_secure_booking` persists the change.
14. Confirm the browser/client code no longer succeeds through a direct `bookings.update` fallback when `update_secure_booking` is unavailable.
15. Confirm one authenticated client cannot cancel, reschedule, or link another client's booking.

## F. Failure Handling

### A Migration Fails Midway

- Stop immediately.
- Do not continue to later migrations.
- Capture the error and inspect which statement failed.
- Compare the target database columns/functions with the dependency table above.
- Restore from backup only if the database is in an inconsistent state that cannot be safely corrected.
- Do not disable RLS to make a migration pass.

### An RPC Signature Is Wrong

- Confirm the function identity arguments with the verification query.
- Reapply the correct migration in staging.
- If production is affected, prepare a new corrective migration instead of editing history after it has been applied.

### The App Reports a Missing RPC

- Confirm the function exists in `public`.
- Confirm the migration was applied to the same Supabase project used by the app.
- Confirm execute permission for `anon` or `authenticated` matches the intended caller.
- Do not restore the old direct-table update fallback.

### Booking Creation Starts Failing

- Check the client-facing error first; it may be a legitimate hold conflict, booking-limit block, or 40-day window block.
- Run the function/signature and permission checks.
- Confirm `booking_holds.client_key`, `released_at`, and expiry fields exist.
- Confirm the frontend is sending `hold_id`, `hold_token`, and `hold_client_key`.
- Confirm the booking reference is unique.

### Admin Updates Fail

- Confirm the user is authenticated and recognized by `current_user_is_booking_admin()`.
- Confirm `update_secure_booking(jsonb)` exists and is executable by `authenticated`.
- Confirm the payload contains only supported fields.
- Do not grant anonymous or broad table updates as a workaround.

### RLS Denies an Expected Action

- Confirm the action is supposed to happen through an RPC rather than direct table access.
- Confirm the function is `security definer` with a safe `search_path`.
- Confirm execute permissions are correct.
- Do not disable RLS globally.

### An Existing Booking Status Is Incompatible

- Identify the exact status/payment status pair.
- Decide whether it should be active, terminal, paid, awaiting verification, cash due, or cancelled.
- Apply a narrow data correction only after approval and backup.
- Prefer adding a future corrective migration for status normalization over manual production edits.
