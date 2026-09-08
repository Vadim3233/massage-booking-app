# Durable service area settings

Area names, visibility, custom identities, travel surcharges and congestion fees are now loaded from Supabase. The editor keeps unsaved changes separate from the catalogue used by bookings. Save replaces the catalogue atomically through an admin-authorized RPC. Existing bookings retain their stored price, travel_fee and congestion_fee; no booking rows are updated by saving areas.

## Activation after review

1. Review and apply `supabase/migrations/20260908120000_create_business_service_areas.sql` through the normal migration process. It creates `business_service_area_catalogue`, `business_service_areas` and `replace_business_service_areas(jsonb)`. This task has NOT applied it remotely.
2. Open Admin → Settings → Areas in the browser containing the existing business settings. If the backend is uninitialized, the old localStorage values are offered as an editable import draft. Check every fee and visibility setting, then press **Save area settings**. Nothing is seeded automatically, and no Mayfair price is hard-coded.
3. Confirm the settings from another browser/device. Public reads expose active areas; authenticated booking admins can also read hidden areas. Direct table writes are not granted to clients or admins; writes use the protected RPC.

Before the table is available and initialized, online area selection is unavailable rather than falling back to potentially incorrect zero-fee defaults. Apply and initialize the catalogue before releasing this frontend. A successful load is kept in memory during background refreshes so focus changes do not discard an in-progress booking. A later successful load supplies updated fees; stale checkout snapshots are invalidated. Browser storage is only an initial admin import source, never the client pricing authority.

## Telegram configuration

`VITE_TELEGRAM_BOT_URL` was found in `.env.local` as the public URL `https://t.me/vadmassagebookingbot`. No token is needed in the frontend.

`src/App.jsx` reads the variable through `normalizeTelegramBotUrl`, then calls `buildTelegramStartUrl` with the confirmed booking reference. The webhook parses `/start <reference>` and calls the existing `link_telegram_chat_to_booking` RPC. Missing or invalid public URLs hide the link and setup instructions, show an email fallback, and emit a configuration warning without the environment value.

For Vercel, configure `VITE_TELEGRAM_BOT_URL` in Project Settings → Environment Variables for Production. Set it for Preview too if preview bookings should link to this bot (or to a separately configured test bot), and Development when using Vercel-managed local env files. This checkout already has the local Development value. The expected format is `https://t.me/<bot_username>`; Vite embeds it at build time, so changes take effect in a subsequent build. Remote Vercel configuration was neither inspected nor changed, and nothing was deployed.

## Verification limits

Local PostgreSQL tests exercise persistence, rollback, RLS and RPC permissions. Component tests cover save states, fee snapshots/history and Telegram links/fallback. A 390px browser fixture verified draft-vs-saved display, saving/disabled states and the 48px keyboard-focusable Telegram link. It uses simulated saves, not remote Supabase. Full live booking, cross-device persistence and Telegram Start delivery still need verification after the reviewed migration/configuration steps.
