# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/), versioned against `package.json`.
Full design/decision history (why, not just what) lives in
[`CONVERSATION.md`](CONVERSATION.md); architecture reference lives in
[`CLAUDE.md`](CLAUDE.md).

## [2.9.0] - 2026-07-06

### Added
- Auto-categorization for manually-added shopping list items: `GroceryItemModal`'s
  "add item" flow no longer has a manual category dropdown — the typed free text
  (which can describe more than one item, e.g. "חלב ולחם") is sent through a new n8n
  workflow, "Categorize Grocery Item (Hebrew)" (webhook `categorize-item`), which
  mirrors Siri's own extraction/categorization Gemini prompt and category list, so
  manually typed and voice-added items get identical categorization. New
  `categorizeItem()` in `firebase.ts` posts to a new `/api/categorize-item` server
  route (same server-side-URL-hiding proxy pattern as the receipt endpoints). If
  nothing relevant is detected or the call fails outright, falls back to adding the
  raw typed text under `OTHER_CATEGORY_NAME` rather than losing it. Deliberately a
  separate n8n workflow from Siri's (which also does Firebase dedup/writes directly
  and has no concept of `list_name`) — this one only extracts + categorizes, same
  "n8n extracts, app persists" split already used for receipt scanning. Verified
  end-to-end: typing "בננה" auto-categorized it under 🍎 פירות with no manual step.

## [2.8.1] - 2026-07-06

### Changed
- Removed the `info` log level entirely from `src/lib/logger.ts` — every backend log
  line is now strictly Success, Warning, or Error, no neutral/informational tier.
  Previously "request received" and "forwarding to n8n webhook..." used `info`,
  showing a plain ℹ icon instead of a typed result; reclassified as Success (normal,
  expected steps in the request lifecycle), reserving Warning for handled/recoverable
  conditions (a `{error: true}` business response from n8n, a failed presigned-URL
  fetch that still falls back to the outer page) and Error for thrown exceptions.
  Verified live in the terminal — `logger.info` no longer exists as a method, so any
  future reintroduction fails at compile time rather than silently.

## [2.8.0] - 2026-07-06

### Changed
- **Every receipt item now ends up on the shopping list, not just ones that already
  matched something.** Previously `ReceiptReconcileModal` only listed items that
  matched an existing `/stock` item or an existing unbought `/groceries` item —
  anything with no match was silently skipped entirely, so scanning a real receipt
  could leave several purchased products completely absent from the list. Now every
  line item appears in the modal: items matching an existing unbought grocery entry
  still get "mark as purchased" (updates the existing record), but items with no
  match get a new "add to shopping list as purchased" option (checked by default)
  that creates a fresh `bought: true` entry via the new `addPurchasedGroceryItem`
  helper in `firebase.ts` — category inferred from a stock match if one exists,
  otherwise falling back to `OTHER_CATEGORY_NAME` (receipts don't carry a category,
  only name/price/quantity). Still fully manual/reviewable, same as before — nothing
  is added or marked without the user hitting confirm. Verified end-to-end against
  the real database (write confirmed via direct query, then cleaned up test data).

## [2.7.1] - 2026-07-06

### Changed
- Backend server-route logging now goes through [consola](https://github.com/unjs/consola)
  instead of raw `console.log`/`console.error`, via a shared `src/lib/logger.ts`.
  Every line is typed as Info/Success/Warning/Error (colored icon/badge) and always
  prefixed with a full ISO timestamp — the timestamp is applied manually in the
  logger wrapper rather than relying on consola's own `formatOptions.date`, which
  turned out to only render when it detects a wide-enough TTY column width (not
  reliable under this dev server's stdout capture) — confirmed by testing both ways
  live against the terminal. Same two routes as v2.7.0 (`scan-receipt`,
  `scan-receipt-url`); upstream success now logs as Success, an `{error: true}`
  business-logic response from n8n logs as Warning (not Error, since it's a handled
  fallback-to-manual-entry case), and thrown exceptions log as Error.

## [2.7.0] - 2026-07-06

### Added
- Timestamped terminal logging for both backend server routes
  (`src/routes/api/scan-receipt.tsx`, `src/routes/api/scan-receipt-url.tsx`) — the
  only server-side ("BE") code in this app, since everything else talks to Firebase
  directly from the browser. Each stage now logs to the terminal running `npm run
  dev`/the production Node process: request received (mime type, payload size),
  page/presigned-URL fetch steps and their status codes, stripped-text length,
  forwarding to the n8n webhook, and the upstream response status — success and
  failure paths both covered. Verified live in the dev server terminal for both
  routes (including the failure path for `scan-receipt-url`).

## [2.6.0] - 2026-07-06

### Changed
- **Replaced Firebase Storage with Firestore for all image/PDF storage** (receipt
  photos and grocery item photos). Storage requires the paid Blaze plan; direct
  queries against Cloud Storage confirmed neither possible bucket name
  (`n8n-vocal-2-db.appspot.com` nor `.firebasestorage.app`) exists — Storage was
  never actually provisioned, and per explicit direction the project should not
  require paid billing. Firestore is free on the Spark plan. Images are now stored
  as base64 documents (`groceryImages/{key}`, `receiptImages/{key}` — id matches the
  owning record's own Realtime Database key) via new `saveImageDoc`/
  `getImageDataUrl`/`deleteImageDoc` helpers in `firebase.ts`, fetched **on demand**
  rather than eagerly synced with the list (`ItemDetailModal` fetches on open; each
  receipt card gets a lazy 📷 "view photo" button instead of loading every receipt's
  image on every list render). Firestore's 1MiB document cap is guarded by a 700KB
  raw-file limit (`MAX_INLINE_IMAGE_BYTES`) — an oversized file (realistically only a
  large multi-page PDF, since photos are already resized/compressed) throws
  `ImageTooLargeError`, which `saveReceipt` catches to still save the extracted item
  data without the photo, surfacing a "file too large, saved without photo" message,
  rather than losing everything. Requires a one-time manual Console step (enable
  Firestore + set its security rules) — see `CLAUDE.md`'s Auth section for the exact
  rules snippet; not something this codebase can do on its own.

## [2.5.0] - 2026-07-06

### Added
- Receipt reconciliation: after saving a scanned (photo or PDF) or URL-sourced
  receipt, each line item is matched by name (same trimmed/lowercased comparison as
  the rest of the app) against current `/stock` items and unbought `/groceries`
  items. If any matches are found, a new confirmation step (`ReceiptReconcileModal`)
  lists them with independently toggleable checkboxes — "add +N to stock" and/or
  "mark as purchased on the shopping list" — defaulting to checked, applied only on
  explicit confirm (same "nothing writes without review" principle as the receipt
  review screen itself and the existing restock-on-checkout prompt). Skipping the
  step (or having no matches at all) falls straight through to the next queued
  receipt exactly as before. New `findUnboughtGroceryItemByName` helper in
  `firebase.ts` mirrors the existing `findStockItemByName`.

### Fixed
- A single-file receipt upload showed no loading feedback at all — the toast that
  reports scan progress only rendered for multi-file queue uploads (`queue.length >
  1`). Now shows a "⏳ Scanning receipt..." toast for single uploads too.

## [2.4.0] - 2026-07-06

### Changed
- Adopted shadcn/ui for form controls and modals (buttons, dialogs, inputs,
  textareas, selects, labels) across all 7 modals (`ItemDetailModal`,
  `GroceryItemModal`, `StockItemModal`, `ReceiptReviewModal`, `CategoriesModal`,
  `AdminsModal`, `RestockPrompt`), replacing the hand-rolled `.modal-backdrop`/
  `.modal-sheet` pattern and native `<input>`/`<select>`/`<textarea>` elements.
  Retheme via Tailwind v4's `@theme inline` CSS variable mapping — the chalkboard
  visual identity is unchanged, verified side-by-side in the browser preview (not
  just by reading the CSS). Bespoke app chrome (the FAB, list-picker pills, tab
  links, small icon-only stock/receipt action buttons) was deliberately left as
  custom-styled native elements — see `CLAUDE.md`'s new "Design system" section for
  the reasoning.
- Added Tailwind CSS v4 (`@tailwindcss/vite`) alongside the existing `App.css` theme
  file, plus `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`,
  and the Radix UI primitives shadcn's components wrap (`@radix-ui/react-dialog`,
  `-select`, `-label`, `-slot`).

## [2.3.0] - 2026-07-06

### Added
- i18n: Hebrew/English support via `react-i18next`, namespaced translation files
  (`src/i18n/locales/{he,en}/*.json`), a language switcher in the header, and dynamic
  RTL/LTR layout switching (`src/hooks/useSyncHtmlLangDir.ts`). Hebrew remains the
  default. Every hardcoded UI string across the app was extracted into translation
  keys (persisted data values like stock unit presets and the protected "אחר" category
  name were deliberately left untranslated — they're matched by equality against real
  Firebase data, not display copy).
- `src/routes/index.tsx` decomposed into smaller components: `ListPicker.tsx`,
  `ShoppingListItemRow.tsx`, `CategorySection.tsx` (under `src/components/`).

### Fixed
- A real SSR hydration failure introduced while wiring up i18n: when a returning
  user's stored language preference differed from the server-rendered default, React
  discarded the entire server-rendered document and did a full client-side re-render
  instead of hydrating. Fixed by always initializing i18n to `'he'` on both server and
  client, and only switching to a stored preference in a post-mount effect. A minor,
  non-fatal residual warning remains for one lazily-loaded route chunk — see
  `CLAUDE.md`'s "i18n" section for the full explanation.

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
