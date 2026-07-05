# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/), versioned against `package.json`.
Full design/decision history (why, not just what) lives in
[`CONVERSATION.md`](CONVERSATION.md); architecture reference lives in
[`CLAUDE.md`](CLAUDE.md).

## [2.2.0] - 2026-07-06

### Changed
- Restructured `src/` into `routes/` (unchanged, TanStack convention), `components/`
  (shared UI: modals, `Layout`), `hooks/` (`AuthContext`, `GroceriesFeedContext`,
  `useCategories`, `useCollapsedSections`), and `lib/` (`firebase.ts`,
  `formatDateTime.ts`, `categories.ts`) — first step of a broader modernization
  (structure → TypeScript → i18n → design system → tests/CI, in that order, per
  explicit direction to build changes before tests/QA).
- Converted the entire frontend from `.jsx`/`.js` to TypeScript (`.tsx`/`.ts`).
  Added `tsconfig.json` (`strict: false`, `strictNullChecks: true` — the latter is
  required by TanStack Router's own types) and `src/types.ts` with shared interfaces
  (`GroceryItem`, `StockItem`, `Category`, `Receipt`, `ReceiptItem`, `AuthUser`) reused
  across every layer. No behavior changes — purely structural/typing.
- Added a local-dev-only auth bypass (`.env.local`, gitignored) — set
  `VITE_DEV_AUTH_BYPASS=true` to sign in as a fake user client-side without a real
  Google popup, for exercising `canEdit`-gated flows in local dev/QA.

### Fixed
- A dev-server file-watcher loop (`page reload src/routeTree.gen.ts` repeating
  indefinitely) after the file move — the generated route tree still imported the
  old `router.jsx` path. Deleting the stale generated file let it regenerate correctly
  against the renamed `router.tsx`. Confirmed cosmetic/non-blocking either way (verified
  the app renders and navigates correctly via direct browser checks and a clean
  production build) — flagged in `CLAUDE.md` in case it recurs.

## [2.1.0] - 2026-07-06

### Added
- Multi-file receipt upload: the photo/PDF upload button now accepts multiple files at
  once (`<input multiple>`), scanning and reviewing them one at a time in sequence. A
  "X מתוך Y" progress counter shows on the upload button and as a banner while each
  file is being scanned, and again inside the review modal once a file's data has
  loaded — so a batch of receipts doesn't silently look stuck between files. Each
  receipt still goes through the same mandatory review-before-save screen; saving or
  cancelling one advances to the next in the batch. Single-file upload behaves exactly
  as before (no counter shown when there's nothing to count).

## [2.0.0] - 2026-07-06

### Changed
- Migrated the frontend from a plain Vite + React SPA to **TanStack Start**
  (file-based routing on TanStack Router, Vite/Nitro under the hood). Done
  incrementally, route by route, on a `migrate/tanstack-start` branch — the three
  tabs ("רשימת קניות" / "מלאי" / "קבלות") are now real routes (`/`, `/stock`,
  `/receipts`) instead of `useState` tab-switching, and the custom/temporary list
  picker is a `?list=` search param instead of local state, so a custom list is now
  a shareable/refreshable URL. UX, auth flow (Google popup sign-in), and data-fetching
  behavior (client-side Firebase `onValue` realtime subscriptions — deliberately kept
  out of TanStack Start's SSR loaders, since they're push subscriptions, not one-shot
  fetches) are unchanged.
- The two receipt-scanning proxies (`api/scan-receipt.js`, `api/scan-receipt-url.js`)
  moved from Vercel serverless functions + a hand-rolled Vite dev-proxy plugin to
  TanStack Start's native file-based server routes (`src/routes/api/*.jsx`). Same
  request/response shape, so no client-code changes were needed beyond the route move.
- Bumped Vite 5 → 8 and `@vitejs/plugin-react` 4 → 6 (required by TanStack Start's
  peer dependencies); React stayed at 18.3.1.

See `CLAUDE.md`'s "Frontend app" section for the new route-tree layout.

## [1.4.0] - 2026-07-06

### Added
- Manual category reordering — ▲/▼ buttons in the categories manager, backed by a new
  `order` field per category (previously always alphabetical by Hebrew name).
- A settings menu (⚙️) consolidating "ניהול קטגוריות" and "שיתוף עריכה" — previously two
  always-visible icon buttons cluttering the main header.
- Unit dropdown for stock items (יח'/ק"ג/גרם/ליטר/מ"ל/חבילה/אחר) instead of free text,
  with a fallback custom-text field when "אחר" is chosen.
- Friendlier error messages when a Firebase write hits `PERMISSION_DENIED` (currently
  expected for `/stock` until its Console rule is applied) — points at the actual fix
  instead of surfacing the raw Firebase error string.
- PDF support for the receipt photo-upload flow — the n8n Receipt Scanner workflow now
  branches between Gemini's image-vision mode (existing) and document-analyze mode
  (new) based on the uploaded file's mime type. The review-before-save screen shows a
  "view PDF" link instead of an image preview for PDF-sourced receipts.

### Changed
- Shopping-list item interaction: a single click/tap now toggles bought/purchased
  directly (previously required a 500ms long-press); opening item details (note/photo)
  moved to a dedicated ℹ️ button per row instead of being the tap target.

### Fixed
- Category sort comparator used `Infinity` as the "no order set yet" sentinel;
  `Infinity - Infinity` evaluates to `NaN` in JS, which silently broke the sort for
  every category (all of them, until someone actually reorders one) — categories
  rendered in raw Firebase key order instead of alphabetically. Fixed by using
  `Number.MAX_SAFE_INTEGER` instead, so equal-order categories correctly fall through
  to the Hebrew-name tiebreaker.
- The reorder buttons would have written `order: undefined` to Firebase (rejected
  outright by the SDK) the first time anyone used them, since no existing category had
  an `order` value yet. Fixed by falling back to the category's current display
  position when swapping.

Built via three parallel subagents (categories, shopping-list interaction/menu, stock
modal) working on non-overlapping files, plus PDF support and this changelog done
directly.

## [1.3.0] - 2026-07-06

### Added
- Receipt-from-URL: paste a link to a digital invoice instead of photographing paper.
  New `api/scan-receipt-url.js` serverless function fetches the link server-side,
  follows a `PresignedURL` one hop further if the page embeds one (confirmed pattern
  on Shufersal's digital-invoice pages — not general, chain-specific), strips to plain
  text, and forwards it to a new n8n workflow ("Receipt URL Parser (Hebrew)") that runs
  Gemini in **text** mode rather than vision, since the input is already text.
- `source_url` field on receipts for link-sourced entries (mutually exclusive with
  `image_url`); the review screen shows a "view original" link instead of a photo
  preview when there's no image.

## [1.2.0] - 2026-07-05

### Fixed
- The receipt-scan webhook URL was called directly from client code, meaning it shipped
  inside the JS bundle to every visitor once deployed — a private GitHub repo doesn't
  prevent this, since it's a runtime client call, not a doc reference. New
  `api/scan-receipt.js` Vercel serverless function holds the n8n URL server-side only;
  the browser calls `/api/scan-receipt` on the app's own domain instead.
- Local dev (`npm run dev`) gets a matching dev-server middleware in `vite.config.js`
  so the URL never reaches the browser locally either, and both environments run the
  exact same handler code (no duplicated proxy logic to keep in sync).

### Deployed
- First production deployment, on Vercel: **https://fridge-list-app.vercel.app**
  (private GitHub repo, auto-deploys on push to `main`).

## [1.1.0] - 2026-07-05

### Changed
- Shopping list redesigned from a grid of separate category cards into one continuous
  flat list, with category names as simple section dividers instead of boxed panels.
- Removed the per-item checkbox; tapping an item opened its detail view, a long-press
  toggled bought/purchased (later replaced by click-to-toggle in 1.4.0).
- Every shopping-list item now shows an inline caption — who added it / who marked it
  bought, and when — reusing `created_by`/`modified_by`/`added_at`/`modified_at` fields
  that were already being stamped but never surfaced in the UI.

### Added
- Siri per-person attribution (n8n side): the webhook now accepts an optional `person`
  field and stamps it as `created_by` on newly-inserted items. Requires a manual,
  per-phone Shortcut update to actually send it (documented in `README.md`) — the n8n
  side alone doesn't attribute anything until each family member's Shortcut is updated.

## [1.0.0] - 2026-07-04

Initial commit — brings together everything built across the first several design
sessions (see `CONVERSATION.md` Sessions 1–5) before version control existed for this
project.

### Added
- **Shopping list**: voice-driven via Siri → n8n → Gemini → Firebase, live-synced,
  grouped by category, Google sign-in with an edit/view permission split.
- **Stock / inventory module**: quantity tracking, low-stock highlighting, manual
  "add to shopping list" action, restock-on-checkout prompt linking the two lists.
- **Custom/temporary lists**: tag-based (`list_name` field), for one-off events like a
  party, separate from the permanent household list.
- **Collapsible category sections**: shared `localStorage`-backed hook, both the
  shopping list and stock tabs.
- **Receipt scanning (photo)**: n8n workflow using Gemini vision to extract items/
  prices/total from a receipt photo, mandatory review-before-save screen, per-item
  price history/diff across past receipts.
- **Dynamic categories**: moved from hardcoded to a live Firebase-backed list with
  icon/color per category and a protected "אחר" catch-all; full create/edit/delete UI.
- **Editor invites**: additional admin emails manageable from the app UI (`/admins`
  path), on top of the permanent hardcoded owner.
- **Share what's missing**: native share-sheet / `mailto:` fallback for the current
  list's unbought items.
- Icons throughout (per-category emoji, tab icons).

### Security
- Full security review before any public exposure: flagged unauthenticated n8n
  webhooks, wide-open Firebase rules, and a hardcoded personal email as things to
  consciously accept or fix before going public (see `CONVERSATION.md`).
