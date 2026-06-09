# Security Audit Summary

## Overview
This repository has a secure foundation for production launch, including:
- Supabase row-level security enabled for private tables
- Security-definer functions for guest and authenticated booking/order creation
- Explicit admin authorization via `current_user_is_booking_admin()` and `admin_users`
- Frontend-only exposure of publishable Supabase keys
- Backend email and Telegram endpoints with origin/CORS checks for serverless APIs

## Key Findings

### Database and Supabase
- `supabase/migrations/20260606170000_private_data_security_hardening.sql` enables RLS on all private data tables:
  - `client_profiles`, `client_addresses`, `client_preferences`, `bookings`, `orders`, `booking_holds`, `admin_users`
- Auth policies are scoped to `auth.uid()` and admin role checks
- Safe booking/order creation is enforced by `create_secure_booking(jsonb)` and `create_secure_order(jsonb)` functions
- No anonymous grants exist for sensitive tables in the migration

### Frontend and Auth
- `src/supabaseClient.js` uses `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only, which is correct for browser-side Supabase auth
- The admin flow checks `current_user_is_booking_admin` after login, preventing UI-only admin elevation
- The app preserves a strong separation between guest booking flows and authenticated admin/session flows

### API Endpoint Security
- `api/telegram-notifications.js` and `api/telegram-test.js` validate allowed origins and enforce CORS for browser requests
- `api/transactional-emails.js` now validates the `x-internal-api-secret` header and requires a trusted server-side caller
- `api/telegram-notifications.js` now validates the `x-internal-api-secret` header and preserves rate limiting for protected route calls
- `api/internal-transactional-emails.js` and `api/internal-telegram-notifications.js` are trusted browser-facing proxies that keep the secret in server-side code only
- Direct browser requests to `/api/transactional-emails` and `/api/telegram-notifications` fail without the secret header
- Browser requests through `/api/internal-transactional-emails` and `/api/internal-telegram-notifications` still succeed when origin checks pass
- `server/server.js` now supports local dev internal proxy routes for the same safe architecture

## Action Items and Recommendations

### Implemented fixes
- Fixed `src/App.jsx` Telegram notification timeout logic to use an abort controller and a defined timeout ID
- Added origin/CORS validation to `api/transactional-emails.js`

### Recommended hardening
1. Use a server-side secret or API token for sensitive backend actions if the email/notification endpoints are publicly accessible.
2. Keep `.env.local` off version control and ensure production secrets are only set in deployment environment variables.
3. Verify `FRONTEND_ORIGIN` and `VITE_API_BASE_URL` are configured consistently in production.
4. Review the email endpoint on deployment for abuse (spam) and add stricter rate limiting if necessary.
5. Consider adding a dedicated service-level key for server-to-server communication when using `api/transactional-emails` from outside the known frontend origin.

## Notes
- The public frontend key is expected and safe for client-side Supabase auth usage.
- The main remaining risk is open backend email/notification endpoints if they are served to untrusted clients without additional auth.
- The app already uses Supabase-auth-protected admin checks for sensitive client data access.
