# Codex Work Progress

## 2026-07-13 Booking Hold RPCs

### Previous Read-Only Verification Findings

- The frontend calls `create_booking_hold` and `release_booking_hold`.
- Hold-related frontend state and inactivity handling already existed.
- The repository had a `booking_holds` table, but no matching SQL function definitions were found.
- The production status of any live Supabase RPCs was unknown.
- The working tree already contained many modified and untracked files, so this work preserves the current tree as the source of truth.

### Current Hold Lifecycle Audited

- Slot selection calls `selectTimeSlot`, which releases any active hold, then calls `createBookingHoldInSupabase`.
- The frontend stores the returned hold ID, token, expiry, start, and buffer end in `activeBookingHold`.
- Changing an enhancement that affects duration clears the selected slot and releases the active hold.
- Going inactive after a selected slot opens the "Still there?" modal after 20 minutes.
- If the modal is ignored for 2 minutes, `releaseClientAppointmentReservation({ returnToStart: true })` releases the active hold and returns the client to the first booking step.
- Leaving/unmounting the client booking component attempts to release the active hold and any checkout appointment holds.
- Booking submission revalidates the selected slot, creates the order and booking, then releases the hold.
- Cash and bank-transfer bookings keep their existing payment-status behavior; the hold RPC only protects the pre-booking slot.
- Admin-created appointments do not use the hold RPC path.

### Migration Created

- `supabase/migrations/20260713120000_add_booking_hold_rpcs.sql`

### RPC Signatures

- `public.create_booking_hold(hold_date date, hold_start_minutes integer, hold_duration_minutes integer, hold_buffer_minutes integer default 60, hold_client_key text default null)`
- `public.release_booking_hold(release_hold_id uuid, release_hold_token uuid, release_client_key text default null)`
- `public.cleanup_expired_booking_holds()`

### Frontend Changes

- Added an anonymous local hold client key stored as `chainScheduler.bookingHoldClientKey`.
- `create_booking_hold` now receives `hold_client_key`.
- `release_booking_hold` now receives `release_client_key`.
- Hold rejection copy is centralized in `src/lib/bookingHoldErrors.js`.

### Tests and Build Results

- Passed: `npm test`
- Passed: `npm run test:migration`
- Passed: `npm run test:migration:rebuild`
- Passed after sandbox escalation: `npm run build`
- Note: the first sandboxed build attempt failed with `spawn EPERM` while Vite loaded config; rerunning the same command with approval succeeded.

### Live Supabase Status

- The migration has only been added to the repository.
- Live Supabase still requires this migration to be applied separately before production can rely on these RPCs.

### Safe Manual Verification Steps

1. Apply the new migration to a staging Supabase project.
2. Open the client booking flow.
3. Select a valid date and time and confirm the booking proceeds to Review.
4. In another browser/session, try selecting the same overlapping time and confirm it is rejected.
5. Change the original selected time and confirm the previous hold no longer blocks the old slot.
6. Go back from Review to Date & Time and select another time; confirm only one active hold remains for that browser key.
7. Wait for the inactivity modal and choose "Continue booking"; confirm the same booking can continue.
8. Trigger inactivity auto-release; confirm the flow returns to Choose your area and the slot is released.
9. Complete a bank-transfer booking and confirm the hold is released after booking creation.
10. Complete a cash booking and confirm the hold is released after booking creation.
11. Create an admin appointment at any time and confirm admin booking behavior is unchanged.

## 2026-07-13 Client Booking Limits

### Hold-Task Issues Reviewed

- The previous hold RPC migration exists in `supabase/migrations/20260713120000_add_booking_hold_rpcs.sql`.
- The frontend created and released holds, but booking submission did not yet send the hold ID/token/client key into `create_secure_booking`.
- That has been fixed so the secure booking RPC can validate and consume the active hold atomically.

### Active Future Appointment Definition

The server counts future appointments that reserve a real slot:

- Included by default: `confirmed`, `pending`, `pending_payment_verification`, `payment_method_review`, and other non-terminal status values.
- Excluded: `cancelled`, `canceled`, `expired`, `rejected`, `refunded`, `completed`, `no-show`, `no_show`.
- Excluded by payment status: `cancelled`, `canceled`, `expired`, `rejected`, `refunded`.
- Excluded service: `personal-event`.
- Future is based on `bookings.date` and `bookings.start_minutes` using database time in `Europe/London`, not `created_at`.

### Returning Client Definition

A returning client is determined only by stored booking history where:

- `status = 'completed'`
- `payment_status = 'paid'`

Confirmed, pending, cancelled, expired, refunded, no-show, and unpaid bookings do not qualify.

### Identity Matching Rule

- Authenticated client bookings use `auth.uid()` as the identity.
- Non-admin clients may not submit another person's `user_id`.
- Guest bookings use normalized lowercase email plus whitespace-stripped phone.
- Guest bookings must include a phone number for this server-side limit to work safely.
- Admin-created bookings may bypass the client limits only when `current_user_is_booking_admin()` is true.

### Migration Created

- `supabase/migrations/20260713130000_enforce_client_booking_limits.sql`

This replaces `public.create_secure_booking(jsonb)` and enforces:

- new-client one-active-future-booking limit;
- returning-client five-active-future-booking limit;
- 40-calendar-day client booking window;
- existing slot conflict protection;
- hold validation and consumption;
- booking-reference uniqueness;
- guest/auth ownership protections;
- transaction-level advisory locking for client-limit and date conflict checks.

### Frontend Handling

- `src/App.jsx` now keeps the anonymous hold client key with the hold returned from `create_booking_hold`.
- Client booking creation now passes `hold` into `addBookingToDay`.
- `src/lib/bookingPersistence.js` includes valid `hold_id`, `hold_token`, `hold_client_key`, and `payment_status` in the secure booking payload.
- `src/lib/bookingHoldErrors.js` maps database limit failures to warm client messages and avoids showing generic SQL/RPC details to clients.

### Tests and Build Results

- Passed: `npm test`
- Passed: `npm run test:migration`
- Passed: `npm run test:migration:rebuild`
- Initial sandboxed `npm run build` failed with Vite `spawn EPERM`.
- Passed after approved escalation: `npm run build`

### Live Supabase Status

- The migration has only been added to the repository.
- Live Supabase still requires both hold RPC and client booking limit migrations to be applied before production has live server-side enforcement.

### Safe Manual Verification Steps

1. Apply migrations to staging Supabase.
2. As a guest with no completed+paid history, create one future appointment and confirm it succeeds.
3. As the same guest email+phone, try a second future appointment and confirm it is blocked with the first-appointment message.
4. Mark the first appointment `completed` and `paid`, then confirm the same client can create up to five future appointments.
5. Confirm the sixth future appointment is blocked.
6. Confirm cancelled, expired, refunded, rejected, completed, no-show, and personal-event records do not count as active future appointments.
7. Confirm completed but unpaid and paid but incomplete history does not make a client returning.
8. Confirm exactly 40 days ahead can be booked and 41 days ahead is blocked.
9. Confirm Book Again hits the same rules.
10. Confirm authenticated users cannot submit another user's `user_id`.
11. Confirm admin-created bookings can still be made outside client limits.
12. Confirm successful client booking consumes the matching hold.

## 2026-07-13 Secure Booking Updates and Payment States

### Previous Tasks Reviewed

- The hold RPC migration remains in `supabase/migrations/20260713120000_add_booking_hold_rpcs.sql`.
- The client booking limit migration remains in `supabase/migrations/20260713130000_enforce_client_booking_limits.sql`.
- The frontend still passes hold ID, token, and client key into `create_secure_booking`.
- Existing hold and booking-limit tests still pass.

### Unsafe Fallback Found

- `src/lib/bookingSupabase.js` previously called `update_secure_booking` and, when that RPC was unavailable, fell back to a direct `from("bookings").update(...)`.
- That fallback could silently bypass the secure RPC boundary in production if RLS or grants were not equivalent.
- The fallback also masked a schema issue: the older `update_secure_booking` migration accepted `payment_status` but did not persist it.

### Fallback Resolution

- Removed the direct `bookings.update` fallback from `updateBookingInSupabase`.
- Removed the direct `bookings.update` path from `updateAdminPersonalEventInSupabase`.
- Missing `update_secure_booking` now fails with a clear operational error telling the operator to apply the latest Supabase migrations.
- Added `supabase/migrations/20260713140000_harden_secure_booking_updates.sql`.
- The hardened RPC is admin-only, `security definer`, uses `set search_path = public, pg_temp`, validates allowed fields/statuses, persists `payment_status`, persists cancellation metadata, and grants execute only to authenticated users.
- Client-facing immediate cancellation failure now shows a generic contact-me message instead of leaking RPC/internal details.

### Booking Mutation Audit

- Client-owned creation: `saveBookingToSupabase` uses `create_secure_booking`.
- Client-owned cancellation: `cancelCurrentClientBooking` uses `cancel_client_booking`; it cannot change payment status or privileged booking fields.
- Client-owned rescheduling: `rescheduleCurrentClientBooking` uses `reschedule_client_booking`; it cannot change payment status, notes, identity, price, service, address, or duration.
- Admin-only creation: personal events use `create_admin_personal_event`.
- Admin-only updates: booking edits, payment verification, cash approval/rejection, cancellation from the admin modal, status changes, and personal-event edits now use `update_secure_booking`.
- Internal order creation: `createOrderRecord` uses `create_secure_order`.
- Remaining direct booking table operation: `deleteBookingFromSupabase` performs an admin delete path from the admin UI. It was not changed in this task; it remains outside the removed update fallback and should still rely on admin route/session plus database permissions.
- Client profile/address mutations in `clientData.js` update client-owned profile data, not booking payment/admin fields.

### Payment-State Matrix

Bank transfer:

- Client has not reported transfer: booking is not paid.
- Client reports/completes the transfer step: `status = pending_payment_verification`, `payment_status = awaiting_verification`.
- Awaiting admin verification: shown as pending/awaiting verification in client and admin views.
- Admin verifies payment: `status = confirmed`, `payment_status = paid`, with payment received metadata in app notes.
- Paid and confirmed: treated as confirmed and paid across client/admin displays.

Cash:

- Client requests cash payment: `status = payment_method_review`, `payment_status = cash_on_arrival`.
- Admin approves cash request: `status = confirmed`, `payment_status = cash_on_arrival`.
- Appointment is confirmed, but payment remains due on arrival.
- Admin later records cash received: `status = confirmed`, `payment_status = paid`.
- Admin rejects cash request: `status = cancelled`, `payment_status = cancelled`, with cancellation metadata; cancelled records no longer reserve active availability.

### Files Changed

- `src/lib/bookingSupabase.js`
- `src/lib/bookingPersistence.js`
- `src/lib/bookingSupabase.test.js`
- `src/lib/securitySchema.test.js`
- `src/lib/secureBookingUpdateMigration.test.js`
- `src/App.jsx`
- `package.json`
- `supabase/migrations/20260713140000_harden_secure_booking_updates.sql`
- `CODEX_WORK_PROGRESS.md`

### Tests and Build Results

- Passed: `node src/lib/bookingSupabase.test.js`
- Passed: `node src/lib/secureBookingUpdateMigration.test.js`
- Passed: `node src/lib/securitySchema.test.js`
- Passed: `npm test`
- Passed: `npm run test:migration`
- Passed: `npm run test:migration:rebuild`
- Initial sandboxed `npm run build` failed with Vite `spawn EPERM`.
- Passed after approved escalation: `npm run build`
- Passed: `npm audit` with `found 0 vulnerabilities`.

### Live Supabase Status

- Repository migrations are complete for this task.
- Live Supabase still requires the hold RPC, client booking limit, and hardened secure update migrations to be applied separately.
- Live RPC availability and live RLS behavior were not verified because no live migrations or deployments were run.

### Safe Manual Verification Steps

1. Apply the three July 13 migrations to staging Supabase.
2. Confirm a bank-transfer booking remains `awaiting_verification` after the client reports the transfer.
3. Confirm the admin can mark that booking paid and confirmed.
4. Confirm a cash request starts as `payment_method_review` and `cash_on_arrival`.
5. Confirm admin cash approval keeps `payment_status = cash_on_arrival`.
6. Confirm admin cash rejection changes the booking to cancelled and removes it from active availability.
7. Temporarily remove or rename `update_secure_booking` in staging and confirm admin updates fail clearly instead of falling back to direct table updates.
8. Confirm client cancellation/rescheduling still use their narrow RPCs and cannot alter payment/admin fields.

## 2026-07-13 Unpaid Reservation Automation Audit

### Compatibility Decision

- The intended schedule is five days, 48 hours, 26 hours, and 24-hour release for genuinely unpaid reservations.
- The current client bank-transfer flow does not create a long-lived "unpaid and not reported" booking.
- A bank-transfer booking is created when the client presses "I've made the bank transfer".
- That created booking uses `status = pending_payment_verification` and `payment_status = awaiting_verification`.
- `awaiting_verification` means the client has reported transfer and is waiting for admin verification; it must not receive payment requests or be auto-expired.
- Cash requests use `payment_status = cash_on_arrival`; approved cash remains due on arrival and must not be auto-expired as unpaid.
- The pre-booking slot hold is short-lived and protected by the hold RPC/inactivity flow; it is not a five-day unpaid reservation state.

Conclusion: the full reminder and release automation is not currently compatible with the booking model. No cron, protected maintenance endpoint, dispatch integration, or expiry migration was added.

### What Was Implemented

- Added reusable eligibility infrastructure in `src/lib/unpaidReservationAutomation.js`.
- The helper is intentionally narrow: only `status = pending` plus `paymentStatus = pending` is treated as a genuine unpaid reservation candidate.
- Existing live states are excluded, including `awaiting_verification`, `paid`, `cash_on_arrival`, `alternative_requested`, cancelled, expired, rejected, refunded, completed, no-show, and personal events.
- Added Europe/London appointment-time conversion for future reminder boundary checks.
- Added internal-secret authorization and reminder-delivery-result helpers for any future protected endpoint.
- Added tests in `src/lib/unpaidReservationAutomation.test.js`.
- Added the new test to `npm test`.

### Migrations Created

- None for this task.

### Endpoint and Scheduler Files

- None for this task.
- No Vercel cron configuration was added.
- No live scheduler is active.

### Tests and Build Results

- Passed: `node src/lib/unpaidReservationAutomation.test.js`
- Passed: `npm test`
- Passed: `npm run test:migration`
- Passed: `npm run test:migration:rebuild`
- Initial sandboxed `npm run build` failed with Vite `spawn EPERM`.
- Passed after approved escalation: `npm run build`
- Passed: `npm audit` with `found 0 vulnerabilities`.

### Live Supabase and Vercel Status

- No live Supabase migration was applied.
- No Vercel deployment, cron setup, or live configuration was performed.
- The previous July 13 hold RPC, booking limit, and secure update migrations still need live application before production can rely on them.

### Future Product Decision Required

Before real unpaid-reservation reminders can exist, the product needs an explicit long-lived state for a booking where:

- the appointment is reserved;
- the client has not yet paid or reported transfer;
- the appointment may fairly be released if payment is not made.

That state must be distinct from `awaiting_verification` and from `cash_on_arrival`.

## 2026-07-13 Final Pre-Deployment Migration Review

### Review Scope

- Re-read `AGENTS.md` and this progress file.
- Inspected the dirty working tree without resetting or discarding existing work.
- Reviewed the July 13 hold, booking-limit, and secure-update migrations against frontend RPC calls.
- Reviewed direct booking mutations and confirmed the removed `bookings.update` fallback has not been reintroduced.
- Created `SUPABASE_MIGRATION_DEPLOYMENT.md`.

### Defect Found and Fixed

- The slot-conflict checks were not perfectly aligned with the active-future booking definition.
- `rejected` and `completed` bookings are terminal/non-active states and should not block new client holds or secure booking/admin update slot checks.
- Updated:
  - `20260713120000_add_booking_hold_rpcs.sql`
  - `20260713130000_enforce_client_booking_limits.sql`
  - `20260713140000_harden_secure_booking_updates.sql`
- Added regression coverage in:
  - `src/lib/bookingHoldRpcs.test.js`
  - `src/lib/clientBookingLimitsMigration.test.js`
  - `src/lib/secureBookingUpdateMigration.test.js`

### Final Verification Results

- Passed: `node src/lib/bookingHoldRpcs.test.js`
- Passed: `node src/lib/clientBookingLimitsMigration.test.js`
- Passed: `node src/lib/secureBookingUpdateMigration.test.js`
- Passed: `npm test`
- Passed: `npm run test:migration`
- Passed: `npm run test:migration:rebuild`
- Initial sandboxed `npm run build` failed with the known Vite `spawn EPERM` limitation.
- Passed after approved escalation: `npm run build`
- Passed: `npm audit` with `found 0 vulnerabilities`.

### Live Supabase Status

- No live Supabase migrations were applied.
- No deployment was performed.
- Staging/production still require manual migration application and the smoke-test checklist in `SUPABASE_MIGRATION_DEPLOYMENT.md`.

## 2026-07-13 Session Preferences Supabase Architecture

### Correction Made

- Paused the localStorage-first implementation and moved the production source of truth to Supabase.
- Added `supabase/migrations/20260713150000_create_session_preferences.sql`.
- The migration creates `public.session_preferences`, seeds the default preferences once with stable UUIDs, enables RLS, allows clients to read only visible non-deleted preferences, and restricts write access to `current_user_is_booking_admin()`.
- `localStorage` is now only a development fallback for this preference configuration; production loads from Supabase and reports an operational message if the migration is missing.

### Client Loading Path

- The client Review step receives `sessionPreferences` from app state.
- App state is populated by `loadSessionPreferencesFromSupabase()` in `src/lib/bookingSupabase.js`.
- Visible preferences are filtered and displayed in saved `sort_order`.
- The first six visible preferences are shown initially; additional visible preferences sit behind "More preferences".

### Admin Write Path

- Admin Settings -> Services & Pricing -> Session Preferences reads the full admin list from Supabase when an admin session is present.
- Add/edit/visibility/delete operations use `saveSessionPreferenceToSupabase()`.
- Reordering uses `saveSessionPreferencesOrderToSupabase()` with a two-phase sort-order update to avoid temporary unique-order conflicts.
- Delete is implemented as soft deletion, and conflicting references pointing to the deleted preference are removed.

### Booking Snapshot Behaviour

- Client selections store stable preference IDs and label snapshots at booking time.
- Historic bookings can display the captured labels even if an admin later renames, hides, or deletes a preference.
- Existing bookings without preference IDs or labels remain compatible.
- Book Again revalidates stored IDs against currently visible preferences and ignores hidden/deleted preferences unless they become visible again.

### Focused Verification Results

- Passed: `node src/lib/sessionPreferences.test.js`
- Passed: `node src/lib/bookingSupabase.test.js`
- Passed: `node src/lib/clientData.test.js`
- Passed: `node src/lib/securitySchema.test.js`
- Passed: `node src/reservationFlow.test.js`

### Full Verification Results

- Passed: `npm test`
- Passed: `npm run test:migration`
- Passed: `npm run test:migration:rebuild`
- Initial sandboxed `npm run build` failed with the known Vite `spawn EPERM` limitation.
- Passed after approved escalation: `npm run build`.

### Live Supabase Status

- No live Supabase migration was applied.
- No deployment was performed.
- Staging/production still require applying `20260713150000_create_session_preferences.sql` before production clients/admins can share session preference configuration across browsers and devices.
