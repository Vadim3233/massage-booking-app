# Client access and invitations: Stage 1

Local foundation migration: `20260907120000_client_access_invitation_foundation.sql`.
Do not apply it remotely as part of this stage. No legacy backfill is included.

## Scope and security boundary

The new `client_access_private` schema contains invitations, UUID-keyed access
and structured access events. RLS is enabled with no browser table policies;
`PUBLIC`, `anon` and `authenticated` have no direct schema/table/helper access.
Public RPCs run with fixed `search_path=pg_catalog` and explicit EXECUTE grants.
Administrative RPCs always check the existing `current_user_is_booking_admin()`
and a non-null `auth.uid()`. No Auth Admin API or service-role secret is used.

**Stage 1 does not enforce admission on existing booking/order/hold RPCs.**
`status=null` means no admitted client access; `BLOCKED` is a durable admission
status, not an Auth ban. Neither state restricts the old booking flow until the
later enforcement cutover. Existing profile RLS and full-name behavior remain.
Creating or editing a profile does not create a new access record.

## RPC contracts

| RPC | Parameters | Caller / result |
| --- | --- | --- |
| `admin_create_client_invitation` | Optional `intended_name`, `mobile`, `source_note` | Authenticated booking admin; returns `id`, raw `token` once, `status`, `expires_at` |
| `admin_revoke_client_invitation` | `invitation_id` UUID | Admin; returns ID/status. Already revoked or expired is a no-op; linked or unknown raises an error |
| `validate_client_invitation` | `token` text | Anonymous or authenticated; returns status/validity and expiry for a matching token. No ID, PII, hash or linked account |
| `accept_client_invitation` | `token`, `profile_fields` JSON object | Authenticated, confirmed-email user; returns their access projection |
| `get_my_client_access` | None | Authenticated; returns `status` (`ACTIVE`, `BLOCKED`, or null), `profile_complete`, `missing_fields` |
| `complete_my_client_profile` | `profile_fields` | Admitted ACTIVE or BLOCKED user; updates contact data only and returns access projection |
| `admin_block_client` | `target_user_id`, optional `reason` | Admin; returns UUID/status. Cannot create a missing access record |
| `admin_unblock_client` | `target_user_id`, optional `reason` | Admin; returns UUID/status. Cannot create a missing access record |

`profile_fields` requires string `first_name`, `last_name`, and `mobile`. An
optional `email` is accepted but ignored: the current confirmed `auth.users.email`
is authoritative. Other fields are rejected. Full name is updated alongside
first/last name. Existing unrelated profile data is retained. Mobile punctuation
is normalized; format validation is not proof of mobile ownership.

Administrative reasons/source notes are limited to 500 characters. Profile names
are limited to 100 characters each. Invitation hints are optional and do not bind
the bearer link to a recipient. Audit records contain bounded fields, not request
payloads, profiles, hashes or raw tokens. Do not enter tokens or treatment details
into administrative free text. No automatic audit deletion/retention policy is
introduced in this stage.

## Tokens, lifecycle and transactions

Tokens are 32 cryptographically random bytes rendered as 64 lowercase hex
characters. Only SHA-256 is stored. The migration resolves pgcrypto's existing
extension schema without moving it; PostgreSQL's built-in SHA-256 hashes tokens.
The future UI builds `/invite/<token>` using its trusted production origin.
There is no raw-token recovery/listing API. Copy on creation; revoke and replace
if the original link is lost.

Stored states are UNUSED/LINKED/REVOKED. EXPIRED is derived from database wall
clock time for an UNUSED invitation. Default lifetime is 30 days. Validation
does not mutate records. Successful redemption writes profile, ACTIVE access,
invitation linkage and two events in one transaction. Any error rolls back all
of them. Same-user retries on a linked invitation are read-only, including after
its original expiry. A blocked user is rejected before any retry/reactivation.
An already ACTIVE account cannot consume another unused invitation.

Admission, profile completion and block/unblock share a transaction-scoped
advisory lock keyed by user UUID, covering the case where no access row exists.
Admission then locks the invitation row. Revocation locks only the invitation.
Expiry is checked after acquiring the row lock using `clock_timestamp()`.
Duplicate status requests do not rewrite timestamps/reasons or append events.

If revocation commits first, waiting admission fails. If admission commits first,
revocation refuses a linked invitation; an admin may then block the admitted
account. If blocking commits first, redemption fails. Blocking queued behind
admission sees the admitted record and sets BLOCKED. Future new-booking mutation
checks must coordinate with the same access-row/status locking boundary.

## Local tests

- `npm run test:client-access`: isolated in-memory PGlite with real pgcrypto,
  database roles, repository-derived admin authorization and profile policies.
- `npm run test:client-access:concurrency`: independent PostgreSQL connections
  against a newly initialized disposable localhost cluster with synthetic users.
  Requires a complete PostgreSQL installation. Set `CLIENT_ACCESS_TEST_PG_BIN`
  to its executable directory when needed; no database URL is accepted.
- `npm test`: existing regressions plus the foundation suite.
- `npm run build`: local production build only.

The concurrency harness refuses to mutate a database unless its data directory
matches the newly created temporary cluster. It stops/removes only that cluster.
PGlite permission/atomicity tests are not a substitute for multi-session locking
tests or later integration tests against Supabase Auth/PostgREST.

## Deferred

Booking/order/hold grant changes, hold ownership, cancellation/rescheduling
changes, Auth settings, client backfill, administrative listing APIs/UI, invitation
URL handling, onboarding screens and deployment all belong to later stages.
Do not treat this migration alone as an invitation-only production cutover.
