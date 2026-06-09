# Deployment Checklist

## Required environment variables
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `FRONTEND_ORIGIN`
- `VITE_API_BASE_URL` or a correctly routed API host in production
- `EMAIL_PROVIDER` (`resend` or `sendgrid`)
- `RESEND_API_KEY` or `SENDGRID_API_KEY`
- `SENDER_EMAIL`
- `REPLY_TO_EMAIL` or `SENDER_REPLY_TO`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_TEST_CHAT_ID`
- `INTERNAL_API_SECRET`
- `API_PORT` (for local API server only)

## Security checks
- Confirm no secrets are committed to Git
- Confirm `.env.local` is ignored locally
- Confirm browser-side code only includes publishable Supabase env values
- Confirm backend endpoints enforce allowed origins
- Confirm `api/transactional-emails.js` and `api/telegram-notifications.js` are protected by `INTERNAL_API_SECRET`
- Confirm direct browser calls to the protected endpoints fail without the secret header
- Confirm browser calls through `api/internal-transactional-emails.js` and `api/internal-telegram-notifications.js` still work
- Confirm browser traffic is routed through `api/internal-transactional-emails.js` and `api/internal-telegram-notifications.js`
- Confirm admin-only actions are protected by Supabase auth and RLS policies

## Supabase setup
- Apply the migrations in `supabase/migrations/` to the target database
- Confirm RLS is enabled for private tables
- Seed admin emails into `public.admin_users` for admin access
- Confirm `public.current_user_is_booking_admin()` works with authenticated Supabase users

## Local smoke tests
- `npm install`
- `npm test`
- `npm run build`
- `npm run api` and verify `http://127.0.0.1:8787/api/health`
- Verify transactional email endpoint responds correctly
- Verify Telegram test endpoint responds correctly and can send a test notification

## Security checks
- Confirm no secrets are committed to Git
- Confirm `.env.local` is ignored locally
- Confirm browser-side code only includes publishable Supabase env values
- Confirm backend endpoints enforce allowed origins
- Confirm `api/transactional-emails.js` and `api/telegram-notifications.js` are protected by `INTERNAL_API_SECRET`
- Confirm browser traffic is routed through `api/internal-transactional-emails.js` and `api/internal-telegram-notifications.js`
- Confirm admin-only actions are protected by Supabase auth and RLS policies

## Production readiness
- Set deployment env vars in the hosting provider securely, including `INTERNAL_API_SECRET`
- Verify `FRONTEND_ORIGIN` matches the deployed frontend domain
- Verify `VITE_API_BASE_URL` points to the production API host
- Enable HTTPS and HSTS on production domain
- Validate email and Telegram provider credentials in production environment
- Confirm Supabase auth persistence and admin session flow in production

## Optional hardening
- Add a server-side secret for `api/transactional-emails` if public access is a concern
- Add dedicated rate limiting for email and notification API endpoints
- Periodically review `admin_users` and Supabase auth policies
- Monitor logs for unauthorized email or Telegram requests
