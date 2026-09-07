# Client access Stage 4 production preflight

Checked 7 September 2026 against linked Supabase project `tnpbelhwbcouenbmorvl` and `https://booking.vadmassage.com`. No remote setting, schema or data was changed.

## Verdict

**NO-GO.** The database schema and migration sequence are compatible, and all native concurrency tests pass. Cutover is blocked because production Auth still uses localhost URLs, Google is disabled, the Google Cloud OAuth origin could not be inspected without an interactive login, and this checkout has no authenticated or linked Vercel deployment path. Applying the Stage 2 migration before those items and the application deployment are ready would stop the currently deployed guest booking flow.

## Database evidence

Remote migration history is clean through `20260903120000`. Exactly these migrations are pending:

1. `20260907120000_client_access_invitation_foundation.sql`
2. `20260907130000_enforce_client_booking_access.sql`
3. `20260907140000_client_access_admin_directory.sql`

The linked `supabase db push --dry-run` completed successfully and listed exactly those three files, with no seeds or unrelated migrations.

The production catalog contains one expected overload for each relevant function: `create_secure_booking(jsonb)`, `create_secure_order(jsonb)`, `create_booking_hold(date,integer,integer,integer,text)`, `release_booking_hold(uuid,uuid,text)`, `cleanup_expired_booking_holds()`, `cancel_recent_booking_request(uuid,text)`, `link_recent_guest_booking_to_client(jsonb)` and `current_user_is_booking_admin()`. No `refresh_booking_hold` or obsolete creation overload was present.

All inspected functions are security-definer functions with fixed search paths. Creation/hold functions currently retain their pre-cutover `anon` and `authenticated` grants, as expected before Stage 2; `PUBLIC` has no direct execute grant. The admin check is callable only by `authenticated` and checks the existing admin table.

RLS is enabled on profiles, addresses, preferences, bookings, orders, booking holds and admin users. `anon` has no direct permission on those tables and `PUBLIC` has no table grant. Existing authenticated policies restrict client records by `auth.uid()` and allow the booking admin where intended. The production profile has `user_id`, `full_name`, `email`, `phone`, `created_at` and `updated_at`; the Stage 1 `first_name` and `last_name` additions are not yet present, as expected.

The existing recent guest-linking and recent guest-cancellation functions have the expected signatures and grants. Stage 2 preserves their bounded historical behavior while preventing account-owned rows from being modified through the guest cancellation path.

## Auth evidence

Current production values:

- Site URL: `http://localhost:5173`
- Redirect allow-list: `http://localhost:5173/**`
- Google provider: disabled
- Google client ID and secret: configured
- Email provider: enabled
- General Auth signup: enabled
- Email auto-confirm: disabled
- Secure email change: enabled

Required production values before release:

- Site URL: `https://booking.vadmassage.com`
- Redirect URLs: `https://booking.vadmassage.com/onboarding`, `https://booking.vadmassage.com/?view=client`, and `https://booking.vadmassage.com/?view=admin`
- Google provider: enabled
- Google Authorized JavaScript origin: `https://booking.vadmassage.com`
- Google Authorized redirect URI: `https://tnpbelhwbcouenbmorvl.supabase.co/auth/v1/callback`

The Supabase project callback URI does not change when only the public app domain changes. The Google JavaScript origin must be checked for the new public domain. General signup must remain enabled for invited users to establish an Auth identity; application UI and database admission remain the booking-access boundary. Normal email login uses `shouldCreateUser: false`, while the invited email flow permits creation.

## Native concurrency

The machine had only PostgreSQL command-line tools under `C:\Program Files\PostgreSQL\18`; server catalog file `share\postgres.bki` was absent. An official EDB PostgreSQL 18.6 portable runtime was extracted under the ignored `.tools` directory and used only for fresh disposable local clusters.

Two Windows harness defects were corrected: `pg_ctl start` can leave its output pipe inherited by the server, so the runner waits for its process `exit` on Windows; and the follower `application_name` exceeded PostgreSQL's 63-byte limit, so its diagnostic label is now shorter.

- Stage 1 native suite: **8 passed, 0 failed**
- Stage 1 plus Stage 2 final-RPC suite: **14 passed, 0 failed**

The observer directly saw the follower waiting on a PostgreSQL `transactionid` lock before the final passing run.

## Legacy accounts and guest history

The read-only roster found one authenticated, non-admin account: `krassnoarmeec@gmail.com`. This is Vad's test account, not a real client, and is explicitly excluded from any legacy-client backfill. It has no client profile and no booking linked by its Auth UUID, so it remains classified **Do not automatically approve**. No legacy accounts are currently approved for backfill, and no backfill was run.

Historical guest bookings remain unowned historical records. They are not bulk-linked or inferred from matching email, phone or name. The bounded recent-guest linking RPC remains the only existing linking path and does not grant client admission.

## Hosting evidence

The live root returns HTTPS `200` with HSTS. The deployed `/invite/<token>` and `/onboarding` routes currently return `404`, use public cache headers and do not return the new referrer or robots headers, confirming Stage 3 has not been deployed. The local `vercel.json` routes and headers are valid for the intended deployment, and `/privacy` is included as an SPA route.

Vercel documents that its logs can contain the actual request path. The initial invitation request can therefore appear upstream before JavaScript removes the token. Mitigations and retention guidance are in `docs/data-protection-operations.md`.

## Verification completed locally

- Full `npm test`: passed, including Stage 1 (29), Stage 2 database (19), Stage 2 frontend (12), Stage 3 database (12), and Stage 3 UI/privacy (18).
- Native concurrency: 8/8 and 14/14 passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Local `/privacy` browser route: rendered successfully with the controller contact, data categories, processors, retention and rights sections.

Production migrations, backfill, Auth changes, deployment and production acceptance/security tests remain unperformed while the release is NO-GO.
