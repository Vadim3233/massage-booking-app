# AGENTS.md

Permanent instructions for Codex agents working on this repository.

## Project

- Mobile-first massage booking application.
- Built with React, Vite, Supabase, and Vercel.
- Contains a public client booking flow and a protected admin system.
- The app is under active development and some development helpers are intentionally present.

## General Development Rules

- Inspect the relevant existing implementation before editing.
- Make small, focused changes.
- Do not redesign or refactor unrelated areas.
- Do not rewrite working systems unless explicitly requested.
- Preserve existing business logic unless the task specifically changes it.
- Do not claim completion without testing and verification.
- Clearly report anything that could not be verified.

## Scope Control

- Modify only files required for the requested task.
- If unrelated problems are discovered, report them separately.
- Do not silently expand the scope.
- Do not delete code merely because it looks old or duplicated.
- Prove code is unused through imports, references, and runtime behaviour before proposing deletion.

## Admin Requirements

- Preserve the active admin functionality.
- Preserve admin login, password recovery, calendar, clients, waitlist, analytics, settings, services, appointment management, personal events, and payment management.
- Preserve convenient client/admin switching during local development.
- Development-only controls may use `import.meta.env.DEV`.
- A clear Admin control may remain visible in development.
- Production client screens should not display a large or prominent Admin button.
- Production admin access must remain reachable through a deliberate protected route, query parameter, or discreet menu entry.
- Hiding an Admin button is not security.
- Supabase authentication, `current_user_is_booking_admin`, RLS, and protected RPC functions are the security boundary.
- Do not remove active admin features while cleaning old code.
- Separate active admin code, development-only controls, and genuinely obsolete code.

## Client Booking Flow

The intended client flow is:

Area -> Treatment -> Duration -> Date & Time -> Review -> Your Details -> Payment -> Confirmation

- Do not add multiple treatments to one booking.
- Client-facing appointment durations are:
  - 60 minutes
  - 90 minutes
  - 120 minutes

## Payment Rules

- Bank transfer is the primary payment method.
- Cash payment requires a clear explanation and intentional confirmation.
- A client pressing "I've made the bank transfer" must not automatically mark a booking as paid.
- Bank-transfer bookings remain awaiting verification until payment is confirmed by the admin.
- Cash bookings remain awaiting approval until approved.
- Do not imply that card payment processing exists unless a real provider has been implemented.
- Bank details must be configurable and must not use placeholders in production.

## Booking and Cancellation Rules

- Preserve the established appointment availability and travel-buffer logic.
- Frontend and database conflict rules must remain consistent.
- Free cancellation is available more than 24 hours before the appointment.
- Late cancellations may be charged up to the full appointment fee.
- Do not change booking, cancellation, rescheduling, or payment policies without explicit instruction.

## Design and Tone

- Mobile-first.
- Use the existing design language.
- Playfair Display for expressive headings.
- Inter for interface text.
- Warm, personal, organised, and professional.
- Avoid corporate, aggressive, policing, or overly clinical wording.
- Avoid oversized headers, unnecessary cards, and excessive icons.
- Do not alter unrelated visual styling during functional tasks.

## Supabase and Security

- Do not weaken RLS.
- Do not expose service-role keys or private secrets in frontend code.
- Do not place real secrets in committed files.
- Database schema changes must be supplied as migrations.
- Do not run destructive database operations without explicit approval.
- Do not delete production bookings, clients, or payment records to fix development issues.
- Check whether client-side fallback updates could bypass intended RPC protections.
- Do not assume the repository schema file is current when migrations may be newer.

## Testing and Verification

After making changes:

1. Run relevant tests.
2. Run `npm run build`.
3. Inspect the final Git diff.
4. Test the changed user journey where practical.
5. Check for browser console errors where practical.
6. Confirm mobile behaviour where the task affects client screens.
7. Report exactly what changed.
8. Report tests that passed or failed.
9. Report anything that could not be tested.

## Encoding and User-Facing Content

- Prevent mojibake and broken encoding such as corrupted currency symbols, broken arrows, or corrupted emoji.
- Do not expose technical backend errors to clients.
- Keep user-facing payment and booking wording accurate.
- Do not use placeholder production content.
