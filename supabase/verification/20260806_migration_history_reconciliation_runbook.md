# Migration History Reconciliation Runbook

This runbook reconciles Supabase migration-history records only after the production schema and checked security state already match.

Do not run schema migrations, `supabase db push`, old unrecorded migration SQL, rollback SQL, deployments, or unrelated commands during this step.

## Evidence Summary

The refreshed consolidated audit reported:

- `48 MATCHED`
- `3 HISTORICAL_MISMATCH`
- `1 UNCERTAIN`
- `0 BLOCKER`
- `0 GENUINELY_PENDING`

Production schema and security checks now match. The remaining issue is migration history.

## Backup Prerequisite

Before repairing history, confirm a current Supabase backup exists and is restorable.

## CLI Syntax

The Supabase CLI was not installed in this local workspace or available on PATH when this runbook was prepared, so the command syntax could not be verified against a local binary here.

The command form below follows the Supabase CLI documentation for `migration repair`, which accepts one or more versions and a required `--status applied` or `--status reverted` flag. `--linked` targets the linked project.

Before running any repair command, verify syntax on the machine that has the Supabase CLI:

```bash
supabase migration repair --help
```

Expected Supabase CLI command shape:

```bash
supabase migration repair <version> --status applied --linked
```

Expected reversal command shape if a version is recorded incorrectly:

```bash
supabase migration repair <version> --status reverted --linked
```

## Read-Only Baseline

Run:

```bash
supabase migration list --linked
```

Save the full output before any repair.

Also run and export:

`supabase/verification/20260806_final_schema_and_migration_reconciliation_audit.sql`

Proceed only if there are no `BLOCKER` or `GENUINELY_PENDING` rows.

## Versions To Mark Applied

Repair one version at a time. After each command, rerun `supabase migration list --linked` and the consolidated audit before continuing.

### 1. `20260720130000`

Reason: its `cancel_recent_booking_request(uuid, text)` effect is present through `20260806120000_reconcile_remaining_production_schema.sql`.

```bash
supabase migration repair 20260720130000 --status applied --linked
```

Verify that this version is recorded and no blockers appear.

### 2. `20260731120000`

Reason: its `client_telegram_links` table, RLS, admin-read policy, indexes, grants, and `link_telegram_chat_to_booking(jsonb)` effect are present through `20260806120000_reconcile_remaining_production_schema.sql`.

```bash
supabase migration repair 20260731120000 --status applied --linked
```

Verify that this version is recorded and no blockers appear.

### 3. `20260731140000`

Reason: its hold-aware public availability effect is superseded by the safer August definition, which includes active `booking_holds` and uses `booking_app_notes_json` for legacy/plain notes safety.

```bash
supabase migration repair 20260731140000 --status applied --linked
```

Verify that this version is recorded and no blockers appear.

### 4. `20260804130000`

Reason: the helper privilege effect is matched: `booking_app_notes_json(text)` and `booking_reference_from_notes(text)` are not directly executable by `PUBLIC`, `anon`, or `authenticated`.

```bash
supabase migration repair 20260804130000 --status applied --linked
```

Verify that this version is recorded and the previous `UNCERTAIN` history row is gone.

### 5. `20260806120000`

Reason: this reconciliation migration was manually executed successfully through SQL Editor and its post-verification/audit effects match. It should be recorded so future migration tooling does not try to apply it again.

```bash
supabase migration repair 20260806120000 --status applied --linked
```

Verify that this version is recorded.

## Final Verification

Run:

```bash
supabase migration list --linked
```

Then run and export:

`supabase/verification/20260806_final_schema_and_migration_reconciliation_audit.sql`

Expected final result:

- no `BLOCKER`
- no `GENUINELY_PENDING`
- no `HISTORICAL_MISMATCH` for the five versions above
- no `UNCERTAIN` for `20260804130000`

Older historical rows, if any remain, must be reviewed separately and must not be repaired blindly.

## Reversal

If the wrong version is marked applied, do not run rollback SQL. Reverse only the mistaken history row:

```bash
supabase migration repair <version> --status reverted --linked
```

Then rerun:

```bash
supabase migration list --linked
```

and rerun the consolidated audit.
