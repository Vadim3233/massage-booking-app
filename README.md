# Chain Scheduler

React admin dashboard and scheduling-engine preview for a mobile massage therapist.

## What is included

- Admin day/week view with independent settings per day.
- Flexible Mode: scans all valid starts inside working hours.
- Optimized Mode: uses the current flow only, with `flowStart`, `flowEnd`, `next slot before flow`, and `next slot after flow`.
- Empty optimized day rules for Flexible Start vs Fixed Start.
- Visible booking blocks and travel buffer blocks.
- Service show/hide controls.
- Booking add/edit/remove controls.
- Duration selection limited to 60, 90, 120, 150, 180, 210, and 240 minutes.
- Travel buffer customization, including zero minutes.

## Run locally

Install dependencies first:

```bash
npm install
```

Start the dashboard:

```bash
npm run dev
```

Start the transactional email API in a second terminal:

```bash
npm run api
```

Email provider keys stay in environment variables. Copy `.env.example` into your local environment setup and set either `RESEND_API_KEY` or `SENDGRID_API_KEY`. The default sender placeholder is `bookings@mydomain.com`.

Run the pure scheduling-engine checks:

```bash
npm run test:engine
```

## Core files

- `src/schedulingEngine.js` contains the framework-independent scheduling rules.
- `src/App.jsx` contains the admin dashboard and preview UI.
- `src/styles/app.css` contains the dashboard styling.
