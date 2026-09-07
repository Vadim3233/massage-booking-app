# Production Safety Repair Runbook

Migration: `supabase/migrations/20260804120000_production_safety_repair.sql`

This runbook is for human review and manual operation. Do not use `supabase db push`
for this repair because the live database has older schema changes whose migration
versions are not consistently recorded.

## Transaction Safety

The approved repair contains transactional PostgreSQL statements only:

- `CREATE OR REPLACE FUNCTION`
- `REVOKE`
- `GRANT`
- `DROP FUNCTION IF EXISTS`

It does not contain `CREATE INDEX CONCURRENTLY`, `ALTER TYPE ... ADD VALUE`,
`VACUUM`, `CALL`, remote SQL, data rewrites, or migration-history writes. It can
be run inside one explicit transaction.

## Manual Application Steps

1. Confirm the read-only preflight has passed and the only expected review item is
   the presence of the two obsolete hold overloads.
2. In Supabase SQL Editor, run and export:
   `supabase/verification/20260804120000_production_safety_repair_pre_application_snapshot.sql`
3. Open a new SQL Editor query.
4. Paste this wrapper:

   ```sql
   begin;

   -- Paste the complete contents of:
   -- supabase/migrations/20260804120000_production_safety_repair.sql

   commit;
   ```

5. Paste the migration contents between `begin;` and `commit;`.
6. Run the query once.
7. If SQL Editor reports any error, do not run any smoke tests. Capture the exact
   error and decide whether rollback is needed. PostgreSQL should roll back the
   transaction automatically if the statement batch aborts before `commit`.

## Post-Application Verification

Immediately run:

`supabase/verification/20260804120000_production_safety_repair_post_application_verification.sql`

Expected result:

- all rows have `status = 'PASS'`;
- obsolete hold overloads no longer exist or cannot be executed by `PUBLIC`,
  `anon`, or `authenticated`;
- modern client-key hold functions exist and are executable by `anon` and
  `authenticated`;
- repaired `SECURITY DEFINER` functions have `search_path=public, pg_temp`;
- affected tables are present and record counts are observable;
- `not_valid_constraints_unchanged_expected_count` reports exactly `12` existing
  `NOT VALID` constraints.

## Migration-History Reconciliation

Manually running the SQL in Supabase SQL Editor does not record version
`20260804120000` in `supabase_migrations.schema_migrations`.

After application and smoke tests pass, mark only this one version as applied.
Use the Supabase CLI repair command, which the Supabase CLI documentation
describes as repairing the remote migration-history table by marking versions as
`applied` or `reverted`.

Safe command:

```powershell
supabase migration repair 20260804120000 --status applied --linked
```

Before running it:

- confirm the local project is linked to the intended production Supabase project;
- run `supabase migration list --linked` and confirm `20260804120000` is present
  locally but missing remotely;
- confirm the SQL Editor application and post-verification passed;
- confirm no one has already marked or applied `20260804120000`;
- do not mark older missing versions as applied or reverted unless each one has
  been independently reconciled against the live schema.

Why older versions must not be repaired blindly: the live database already has a
mixed migration-history state. Marking old versions without proof can hide real
schema drift; executing old versions can fail on duplicate objects or change live
behaviour unexpectedly.

## Live Smoke Tests

1. Create and release a modern booking hold from the client Date & Time step.
2. Complete a normal guest bank-transfer booking.
3. Confirm public availability still loads after the booking.
4. Attempt an invalid or past client reschedule and confirm it is rejected.
5. Confirm conflict rejection and active-hold rejection.
6. Confirm a legitimate client reschedule still works.
7. Confirm recent guest-booking linking works for a matching authenticated email.
8. Confirm client order creation cannot set `paid` or preserve a trusted
   client-supplied `total_amount`.
9. Confirm Admin can still view and update the booking.
10. Confirm ordinary admin email and Telegram notifications remain unaffected.

Do not create real card payments. Use ordinary booking/test data only.

## Rollback Triggers

Rollback immediately if:

- the migration transaction reports a committed partial or unexpected state;
- post-verification reports missing repaired functions, missing modern hold
  functions, unsafe `search_path`, wrong grants, or missing affected tables;
- ordinary public availability fails for all clients immediately after apply;
- modern hold creation/release fails with function/signature/permission errors;
- normal guest bank-transfer booking cannot create order or booking because of
  repaired function errors;
- Admin cannot view/update bookings because of repaired function/grant changes.

Investigate without immediate rollback if:

- a single slot is unavailable because it is genuinely booked or held;
- a client is correctly rejected for past time, 2-hour notice, 40-day limit, wrong
  owner, duplicate active booking, or conflict;
- email or Telegram delivery fails while booking/order creation succeeds;
- the post-check still reports the same twelve `NOT VALID` constraints and no
  other issue;
- smoke-test data entry is invalid.

## Rollback Steps

Only if rollback is required:

1. Save the migration error, post-verification output, and smoke-test failure.
2. In Supabase SQL Editor, run:
   `supabase/rollback/20260804120000_production_safety_repair_rollback.sql`
3. Re-run:
   `supabase/verification/20260804120000_production_safety_repair_pre_application_snapshot.sql`
4. Confirm the known pre-repair function surface has been restored.
5. Do not delete or rewrite booking/order data automatically. Any records created
   while the repair was active need manual review.
