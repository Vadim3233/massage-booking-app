# Stage 3: invitation onboarding and access administration

This is a local implementation only. No Supabase project, production Auth setting, production data, Vercel project, deployment, or remote repository was changed. Stage 4 has not started.

## Client flow

`/invite/<64-lowercase-hex-token>` is rewritten to the SPA. A synchronous bootstrap script captures a syntactically valid token into `sessionStorage`, records no token in localStorage, and immediately replaces the visible URL with `/onboarding` before the application module and its imports load. Malformed invitation paths are also cleaned and fail closed. The context expires locally after 24 hours and is cleared after successful admission or a terminal invalid, expired, revoked, or linked result.

The onboarding screen calls `validate_client_invitation` without consuming the invitation. A valid invited client can continue with Google or email. Both Auth methods return to the fixed token-free `/onboarding` URL. The raw invitation is not included in the OAuth redirect or state parameters. Email account creation is enabled only in the invited flow; normal returning email sign-in sends `shouldCreateUser: false`.

After Auth succeeds, the screen reads the verified Auth identity and current access. It pre-fills individual provider name fields when available. A combined display name is placed in the editable first-name field while last name remains empty, forcing the person to confirm the split. First name, last name, and mobile are required. The RPC payload contains only those fields; Auth-confirmed email remains authoritative. Address, health, treatment, payment, and preference data are not collected.

The invitation is consumed only by `accept_client_invitation`, which retains the Stage 1 atomic transaction. Validation errors do not consume it. Lost tab context cannot admit a user and instructs the person to reopen the original invitation. Email links must be opened in the same tab-scoped browsing context; if a mail app opens another context, the client must reopen the original invitation there after authentication.

Normal booking entry uses `get_my_client_access` before showing booking controls:

- ACTIVE and complete enters booking.
- ACTIVE and incomplete opens profile completion using `complete_my_client_profile`.
- BLOCKED receives neutral wording, no block reason, and retains My Bookings/sign-out.
- Authenticated with no access receives the invitation-required state unless a valid tab invitation exists.
- Loading and network failure never expose booking controls.

Authentication alone no longer creates a profile, claims recent guest bookings, or grants access. Existing explicit profile-save and secure guest-link capabilities remain available under their established rules, but they are not invoked as an automatic sign-in side effect.

## Administration

The existing Clients area now separates Booking history, Invitations, and Client Access. Booking-derived customers remain historical context; hiding/deleting one does not alter authoritative access.

Invitations supports optional name, mobile, and source note; creation; one-time link display/copy; UNUSED, LINKED, REVOKED, and derived EXPIRED states; dates; linked client; revocation confirmation; and replacement draft preparation. The returned secret is held only in component memory for the immediate copy operation. It is cleared after copy, dismissal, refresh, changing view, tab/page hiding, unmount, or five minutes. List results never return token hashes or raw tokens.

Client Access lists account UUID, profile name, verified Auth email, mobile, status, admission source/date, and invitation ID. Blocking requires a deliberate confirmation and explains that existing booking management remains available. An optional reason is sent only to the private Stage 1 audit/access model and is excluded from client and directory projections. Unblocking also requires confirmation.

The new migration `20260907140000_client_access_admin_directory.sql` adds only two bounded, paginated read RPCs:

- `admin_list_client_invitations(integer default 0)`
- `admin_list_client_access(integer default 0)`

Both are SECURITY DEFINER with `search_path=pg_catalog`, invoke `client_access_private.assert_admin()`, return at most 50 records, reject negative offsets, and are executable only by `authenticated`. Existing create/revoke/block/unblock RPCs remain the mutation boundary. No browser role receives private table access.

## URL and privacy controls

`index.html` declares `no-referrer`. Local `vercel.json` adds SPA rewrites for `/invite/:token` and `/onboarding`, a global `Referrer-Policy: no-referrer`, plus `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow` on both sensitive routes. These settings still require deployment verification in Stage 4.

Before production release, Supabase Authentication URL Configuration must permit the fixed callback `https://booking.vadmassage.com/onboarding` in Redirect URLs. The Site URL should remain `https://booking.vadmassage.com`. Stage 3 did not change either setting.

Application code does not log invitation tokens, add them to analytics/error reporting, save them in client profiles, include them in callback URLs, or return them from admin lists. Hosting infrastructure will necessarily receive the original invitation path as the initial HTTP request; access-log retention is a Stage 4 operational/privacy review item.

## Verification on 2026-09-07

- Stage 3 database/security: 12 passed, 0 failed.
- Stage 3 component-flow: 17 passed, 0 failed.
- Full configured `npm test`: passed, including Stage 1 (29/29), Stage 2 database (19/19), Stage 2 frontend (12/12), and Stage 3 (29/29).
- Production `npm run build`: passed after permitting Vite's local subprocess. No deployment occurred.
- Browser verification used the isolated fixture server, which disables config/env loading and injects an in-memory Supabase-shaped client. It never contacted Supabase. At 390×844, direct invitation cleanup, Google-return simulation, editable profile completion, ACTIVE completion, BLOCKED/My Bookings, Invitations list/create/copy/revoke, Client Access list, and confirmed block/unblock passed. Browser console was checked after the corrected fixture startup.
- Actual Google OAuth, email delivery/callback, Supabase Auth session exchange, live database UI integration, Vercel rewrite/header behavior, and responsive behavior in the complete production app were not exercised because remote access was prohibited.

## Outstanding release gates

The native PostgreSQL concurrency suites remain mandatory. The latest attempt still failed before all cases because `C:/Program Files/PostgreSQL/18/share/postgres.bki` is missing. The test code and locking model remain unchanged.

Stage 4 retains production backfill planning/execution, Supabase URL/Auth verification, Google provider verification, deployed rewrite/header checks, real OAuth/email end-to-end QA, final Privacy Notice/legal work, infrastructure log-retention review, deployment, production data work, and cutover.

Stage 3 is locally complete for release-preparation review. It is not ready for production release until the outstanding native concurrency and Stage 4 release gates pass.
