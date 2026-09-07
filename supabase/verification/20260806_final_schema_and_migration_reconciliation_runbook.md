# Final Schema and Migration Reconciliation Runbook

This is a read-only audit step. It does not apply, revert, repair, or deploy anything.

## Run This One SQL File

In Supabase SQL Editor, open and run the complete contents of:

`supabase/verification/20260806_final_schema_and_migration_reconciliation_audit.sql`

Export the complete result table as CSV and return that CSV to Codex.

## Optional Read-Only CLI Evidence

You may also capture migration-history output with:

```bash
supabase migration list --linked
```

Return the full command output to Codex together with the CSV.

## Do Not Run Yet

Do not run:

- `supabase db push`
- `supabase migration repair`
- any migration up/down command
- any rollback SQL
- any remote SQL other than the single read-only audit file above
- any deployment
- any app rebuild or refactor as part of this reconciliation

## What Codex Needs Back

Send back:

- the exported CSV from the audit SQL;
- the optional `supabase migration list --linked` output, if you ran it;
- whether the SQL Editor showed any error.

The next decision should be made from that evidence only.
