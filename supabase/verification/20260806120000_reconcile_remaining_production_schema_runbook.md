# Remaining Production Schema Reconciliation Runbook

This runbook is for `supabase/migrations/20260806120000_reconcile_remaining_production_schema.sql`.

## Boundaries

Do not run `supabase db push`, `supabase migration repair`, older unrecorded migrations, rollback SQL, deployments, app rebuilds, or unrelated SQL.

## 1. Backup

Before applying anything, take a Supabase project backup or confirm the latest automatic backup is restorable.

## 2. Preflight

Run this read-only SQL file in Supabase SQL Editor:

`supabase/verification/20260806120000_reconcile_remaining_production_schema_preflight.sql`

Export or copy all rows. Review any `REVIEW` row manually.

Expected production preflight from the exported audit:

- `client_telegram_links_table`: `REQUIRED`
- `cancel_recent_booking_request_signature`: `REQUIRED`
- `link_telegram_chat_to_booking_signature`: `REQUIRED`
- anon execution cleanup checks for the four admin/client-owned functions: `REQUIRED`
- availability behaviour: usually `NOT_REQUIRED` if the August repair is already active

## 3. Apply

If the preflight matches the expected need, run only:

`supabase/migrations/20260806120000_reconcile_remaining_production_schema.sql`

Use Supabase SQL Editor. Do not run the older unrecorded migrations directly.

## 4. Verify

Run:

`supabase/verification/20260806120000_reconcile_remaining_production_schema_post_verification.sql`

Every row should return `PASS`.

Then rerun the consolidated audit:

`supabase/verification/20260806_final_schema_and_migration_reconciliation_audit.sql`

Expected blocker count after this migration is zero. Historical mismatch rows may remain for older migration-history reconciliation.

## 5. Smoke Tests

After verification:

- open public availability and confirm available times load;
- create and release a booking hold;
- complete a test guest bank-transfer booking without real payment;
- test the confirmation-page recent cancellation button on a fresh test booking;
- open the Telegram bot with `/start <booking-reference>` and confirm the webhook links the chat;
- confirm admin can still update bookings and create personal events;
- confirm signed-in client cancellation still works;
- confirm anon cannot execute admin/client-owned RPCs directly.

## 6. Migration History Recommendation

Do not mark history during the schema application step.

Evidence-based recommendation after successful post-verification:

- `20260720130000_cancel_recent_booking_request.sql`: superseded by `20260806120000`; do not execute old SQL. Later consider history-only baseline/repair only after comparing live state.
- `20260731120000_link_telegram_chats_to_bookings.sql`: superseded by `20260806120000`; do not execute old SQL.
- `20260731140000_align_public_availability_with_holds.sql`: behaviour is superseded by `20260804120000`; do not execute old SQL if the post-verification shows hold-aware availability.
- `20260804130000_remove_helper_authenticated_function_grants.sql`: if live effect remains matched but history is missing, treat as database-correct/history-uncertain. Only consider history-only repair after preserving the exported audit evidence.
