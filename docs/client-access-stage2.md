# Stage 2: authenticated client creation boundary

Local implementation only. No remote database, Auth configuration, deployment, push or legacy backfill was performed. Stage 3 has not started.

## Migration and authorization

`supabase/migrations/20260907130000_enforce_client_booking_access.sql` depends on the Stage 1 foundation and the existing reconciled booking functions. Apply only as a reviewed production cutover with separately authorized backfill/onboarding readiness; running this migration alone would deny existing clients without ACTIVE access records.

The migration adds nullable `booking_holds.user_id` with an Auth foreign key and expiry index. Historical rows remain nullable; no booking/order/client data is rewritten. Old unowned holds cannot complete new client bookings and expire under existing cleanup rules.

The installed rule bodies are moved into the private schema, renamed, and removed from browser execution. This deliberately retains the actual installed business logic rather than copying an older schema snapshot. New public SECURITY DEFINER wrappers have `search_path=pg_catalog`, qualified references and explicit grants. Tests compare original and retained bodies byte-for-byte.

| Public RPC | Previous authorization | Stage 2 authorization |
| --- | --- | --- |
| `create_secure_booking(jsonb)` | Anonymous guest or authenticated owner/admin | Authenticated ACTIVE client, complete profile, owner-bound hold; derive user_id; reject forged owner; verified admin retains manual booking |
| `create_secure_order(jsonb)` | Anonymous or authenticated client/admin | Authenticated ACTIVE complete client; derive user_id; verified admin retains existing rules |
| `create_booking_hold(date,integer,integer,integer,text)` | Anonymous browser key, including refresh | Authenticated ACTIVE complete client or verified admin; owner assigned by server |
| `release_booking_hold(uuid,uuid,text)` | Browser key/token bearer | Authenticated owner or verified admin, with existing key/token checks; BLOCKED owner allowed |
| `cancel_recent_booking_request(uuid,text)` | Recent booking bearer reference | Account-owned row requires owner/admin; historical guest reference/time/status rules retained |

The first five original implementations are retained as `client_access_private.<original_name>_rules` with the same argument types. Neither browser role has schema access or function execution there. No public alias to the old implementation remains. Admin authority comes only from `current_user_is_booking_admin()`, never a payload flag.

Every client creation calls `assert_creation_access()` inside the final transaction. It takes Stage 1's per-user advisory transaction lock, locks the access row, checks live ACTIVE status and checks the actual required profile/Auth fields. The same lock orders admission, blocking and creation. If creation wins, blocking waits for its transaction; if blocking wins, subsequent creation sees BLOCKED and fails. Orders and holds do not confer later permission.

Hold keys are namespaced by authenticated UUID plus SHA-256 of the original browser key. This prevents shared or manipulated browser keys from refreshing/replacing another user's hold. Refresh retains the old token-rotation behavior. Booking checks hold ownership and translates the original key before existing token/date/duration/expiry/conflict validation. Failed calls roll back changes.

## Revoked capabilities

Anonymous/PUBLIC execution is removed from these exact current signatures:

- `public.create_secure_booking(jsonb)`
- `public.create_secure_order(jsonb)`
- `public.create_booking_hold(date,integer,integer,integer,text)`
- `public.release_booking_hold(uuid,uuid,text)`
- `public.cleanup_expired_booking_holds()`

Only the first four are granted back to authenticated. Cleanup remains available internally to the definer functions, not directly to browser roles.

The migration enumerates every overload of those five public names and revokes it before granting the intended signatures. Known historical hold signatures `public.create_booking_hold(date,integer,integer,integer)` and `public.release_booking_hold(uuid,uuid)` were dropped by the August repair; if still present they are revoked from both browser roles. Tests deliberately reintroduce those and synthetic `create_secure_booking(text)` / `create_secure_order(text)` overloads to verify revocation. The synthetic text signatures are test adversaries, not claimed production functions.

Table-level and column-level INSERT grants on bookings, orders and booking_holds are explicitly removed from PUBLIC, anon and authenticated. Existing admin-only UPDATE/DELETE RLS and owned SELECT policies are retained. No direct insert fallback was added. Harmless public availability/configuration reads remain public; tested availability results expose no account identity or hold secrets.

## Frontend

Booking persistence always obtains the authenticated Supabase client, including when frontend userId/address fields are absent. Hold create/release helpers in App and the admin workspace do likewise. RPC failure remains failure.

`clientAccess.js` provides a fail-closed UX preflight and controlled access messages. `useClientBookingAccess` checks identity changes, focus and explicit retries; generations discard stale responses. It is not the security boundary: final database mutations independently recheck live access.

The simple access notice covers booking entry and deep links. Slot selection, details/review continuation and payment confirmation recheck. Book Again and other returning shortcuts reach the same gated interface. My Bookings and already-confirmed booking management remain accessible. Preview-only local behavior does not bypass RPC authorization.

Waitlist acceptance rechecks access, obtains an authenticated hold, supplies signed-in account contact details and uses `addBookingToDay` -> `saveBookingToSupabase` -> the same secure booking RPC. It marks accepted only after successful persistence and attempts hold cleanup on failure. Local offer state grants no authority. Existing waitlist/payment semantics are otherwise retained; this is not a waitlist redesign or final onboarding UI.

## Existing rights and historical data

BLOCKED clients can SELECT their own bookings, release their own holds, cancel and reschedule under existing rules. Cancellation/rescheduling bodies and policies are unchanged. Rescheduling updates the existing row; it cannot revive an ineligible cancelled booking or add rows. Other accounts cannot manage it.

Historical guest cancellation retains the reference, one-hour creation window, future-time and eligible-status checks. The new account ownership check runs before its original rules. Existing secure guest linking still requires the supplied reference, matching signed-in email, recent creation and an unowned/already-owned row. It does not grant admission or automatically claim by identity alone.

The separate existing Telegram reference-link RPC writes notification-link records, not bookings/orders/holds or admission. Its existing public behavior is outside this creation cutover and was not changed.

## Verification, 2026-09-07

- Stage 2 database tests: **19 passed, 0 failed** using an isolated PGlite database with actual repository rule bodies and RLS policies, including obsolete-grant fixtures.
- Stage 2 frontend tests: **12 passed, 0 failed**. Includes actual extracted waitlist handler execution with stubbed dependencies, preflight failure matrix, persistence checks and React server-rendered access notice. The waitlist UI tests do not claim a live Supabase end-to-end run.
- Stage 1 foundation tests: **29 passed, 0 failed**.
- `npm test`: full configured regression suite passed, including both stages. Guest-mode assertions were updated to the explicitly requested authenticated behavior.
- `npm run build`: passed after allowing local build subprocess execution; the sandboxed attempt failed with spawn EPERM.
- Final diff reviewed. No earlier migration was edited.
- Browser console/mobile interaction and real OAuth/database end-to-end behavior were **not verified**. No remote connection was made. Server-rendering verifies the controlled notice and management controls, not responsive browser layout.

### Native concurrency remains mandatory and outstanding

`npm run test:client-access:concurrency` retains all eight original Stage 1 cases.
`npm run test:booking-access:concurrency` runs those eight plus six real final-RPC races (block wins / creation wins for booking, order and hold) in a fresh disposable local cluster. No database URL or existing application database is used. The runner requires observing the follower waiting on a native database lock.

The Stage 2 native command was attempted and failed at initialization: `C:/Program Files/PostgreSQL/18/share/postgres.bki` does not exist. **0 of 14 native cases executed.** JavaScript syntax checks passed, but race behavior remains unverified. PGlite tests are not a substitute. Repair the local PostgreSQL installation separately and pass both native commands before production cutover. The locking model was not weakened or redesigned.

## Deferred and verdict

Final invitation/onboarding screens, Admin Invitations and Client Access directories, Privacy Notice, legacy backfill, Auth hook/signup changes, SMS/recipient verification and deployment remain deferred. Production rollout is not authorized by this local implementation.

For the repository's reviewed RPC/grant/RLS paths after this migration, no known anonymous, unadmitted or BLOCKED normal-client creation bypass remains. Verified admin manual creation is an intentional separate authority. This is a local code verdict, not a statement about the unchanged live system. **Production cutover is NO-GO until mandatory native concurrency and rollout verification are complete.**
