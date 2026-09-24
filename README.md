# Fridge List App

A shared household grocery app built for a fridge tablet and mobile devices. The app
combines real-time Firebase data, authenticated server routes, n8n automation, receipt
scanning, feedback capture, and bilingual Hebrew/English UI.

## Product Overview

- Real-time grocery lists grouped by category, with bought/unbought state synced across devices.
- Multi-list support for household shopping contexts.
- Receipt scanning from uploaded files or receipt URLs.
- Voice and automation-friendly n8n write endpoints.
- Feedback-to-ticket workflow with retry handling.
- Stock tracking and purchase-habit summaries.
- Hebrew-first UI with English support.

## Tech Stack

- React 18, TanStack Router/Start, Vite, TypeScript
- Firebase Auth, Realtime Database, Firestore, Firebase Admin SDK
- n8n webhook integrations for categorization, receipt scanning, and feedback routing
- Jest, Testing Library, Playwright
- GitHub Actions CI and Vercel deployment

## Architecture

```text
Browser / fridge tablet
  -> TanStack Router UI
  -> Firebase client SDK for real-time reads
  -> Authenticated server routes for trusted integrations and migrated writes

Server routes
  -> Firebase token verification
  -> Application services under src/modules
  -> Firebase Admin repositories or n8n providers

n8n / external services
  -> Categorization
  -> Receipt parsing
  -> Feedback ticket creation
```

The codebase is organized around module boundaries in `src/modules`. Shared client
helpers live under `src/lib`, UI components under `src/components`, and route handlers
under `src/routes`.

The write boundary is being moved toward server-owned commands: grocery and receipt
mutations have authenticated server-route paths, while some legacy Firebase client
helpers remain for realtime-era flows that have not been fully migrated yet. The
target fail-closed Realtime Database rules and cutover notes live in
`database.rules.json` and `database.rules.md`.

## Security Model

- Firebase Realtime Database rules live in `database.rules.json`.
- Browser-facing Firebase config is loaded from `VITE_FIREBASE_*` env vars.
- Server-only credentials stay in server env vars and are never shipped to the browser.
- Server routes that call paid or quota-limited integrations require Firebase auth.
- n8n machine writes require `N8N_WRITE_SECRET` and are limited to `N8N_ALLOWED_LIST_ID`.
- Receipt URL scanning uses an SSRF-safe fetcher before forwarding content to the scanner.
- Missing integration configuration fails closed with safe error responses.

## Local Setup

Requires Node.js 22.12 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with Firebase and integration values for the features you want to run.
Open the dev URL printed by Vite, usually `http://localhost:5173`.

For local manual QA without Google sign-in, set:

```bash
VITE_DEV_AUTH_BYPASS=true
```

Do not enable the dev auth bypass in production.

## Environment

See `.env.example` for the full list. The main groups are:

- `VITE_FIREBASE_*`: public Firebase web config.
- `FIREBASE_*`: server Firebase project, database, and Admin SDK configuration.
- `*_WEBHOOK_URL` / `RECEIPT_*`: stable n8n webhook endpoints.
- `N8N_*`: machine-to-machine write authorization.
- `CRON_SECRET`, `GITHUB_RELEASES_TOKEN`, `SMTP_*`: optional scheduled, release, and email integrations.

## Test Commands

```bash
npm run typecheck
npm test -- --ci
npm run test:architecture
npm run architecture:check
npm run build
npm run test:e2e
```

CI runs architecture checks, typecheck, Jest, and build on every push and pull request.
Production deployments also run Playwright smoke tests against the deployed app.

## Deployment

The app is designed for Vercel.

1. Configure the environment variables from `.env.example`.
2. Connect the repository to Vercel.
3. Deploy with the project build command:

```bash
npm run build
```

The app includes server routes and scheduled work, so deploy it as a full Vercel app,
not as a static-only `dist` folder.

## Demo Notes

For assessment, pair this repository with a short screen recording or screenshots of
the live app showing list sync, receipt scanning, and the fridge-tablet layout.
