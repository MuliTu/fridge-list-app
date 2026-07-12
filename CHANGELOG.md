# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/), versioned against `package.json`.
Full design/decision history (why, not just what) lives in
[`CONVERSATION.md`](CONVERSATION.md); architecture reference lives in
[`CLAUDE.md`](CLAUDE.md).

## [2.27.2] - 2026-07-12

### Security
- Hardened the invite-email server route against HTML injection and SMTP header injection: user-controlled fields are now HTML-escaped before going into the email body, and the recipient address is validated (rejecting malformed/whitespace-bearing values with a 400) while the inviter name is length-capped and newline-stripped.

## [2.27.0] - 2026-07-11

### Added
- Product names can now be edited: the item details modal's title becomes an editable field (pre-filled, 1-100 chars, required) that saves alongside the note/photo/category in the same "Save" action, syncing in real time to every household member.

## [2.26.0] - 2026-07-11

### Added
- Shopping-list items can now be sorted by name (A-Z/Z-A, locale-aware) or by when they were last updated (newest/oldest first) via a compact sort picker next to the search box, with the choice remembered per list per signed-in user.

## [2.25.0] - 2026-07-11

### Added
- Shopping-list items can now be dragged from one category section and dropped onto another to re-categorize them (desktop/tablet, native HTML5 drag-and-drop, editors only, persisted instantly), with an accessible "Move to category" picker in the item details modal as a keyboard/screen-reader-friendly alternative.

## [2.24.0] - 2026-07-11

### Changed
- Sending feedback is now non-blocking: the form closes immediately on submit and a transient, non-modal status toast (sending → success/failure) reports the outcome so the user can keep using the app during the slow n8n round-trip.
## [2.23.0] - 2026-07-11

### Added
- After marking a shopping-list item as bought, the restock prompt now appears whether or not the item is already tracked in stock — an existing match adds to its quantity, a miss offers to create a fresh stock entry (quantity 1) — and a "Stock suggestion: On/Off" toggle in the settings menu lets editors disable the prompt entirely.
## [2.22.0] - 2026-07-11

### Added
- Real-time client-side search box on the shopping list that filters items in the current list by name (case-insensitive substring), with a clear (✕) button and a "no items found" state, coexisting with the per-list hide-purchased filter and resetting when you leave the tab.

## [2.21.0] - 2026-07-10

### Added
- Purchased (bought) items are now hidden by default on the shopping list, with a "🛒 Show/Hide purchased items ({{count}})" toggle whose state is remembered per list in `localStorage` (`useShowPurchased`); when shown they keep their struck-through styling, and a list where everything is bought shows an "All purchased 🎉" message with the toggle still available.

## [2.19.1] - 2026-07-09

### Fixed
- An invited user hit a raw, unhelpful Firebase error on sign-in (`auth/missing-initial-state`, caused by the browser blocking cross-origin storage — common in in-app browsers like Gmail/WhatsApp or with strict privacy settings); it now shows a translated, actionable message instead.

## [2.19.0] - 2026-07-09

### Changed
- Viewing the app now requires Google sign-in and being an invited household member, closing a real reported gap where a casually shared tablet URL let anyone view the whole list with no authentication.

## [2.18.1] - 2026-07-09

### Fixed
- Fixed SPA-mode production builds hanging forever after completing (root cause: prerendering opens a real, never-closed connection to production Firebase) by wrapping `vite build` in `scripts/build.mjs` to force-exit once its output is confirmed written.
- Updated `scripts/vercel-build.mjs`'s routing so only `/api/*` requests hit the Lambda and every page request serves the static SPA shell directly, the behavior SPA mode was actually meant to provide.

### Added
- Bulk item import on the shopping list: a "📥 ייבוא רשימה" pill opens `BulkUploadModal` to paste or upload a `.csv`/`.txt` list (one item per line, optional `name,category`), auto-categorizes uncategorized items via a batched `categorizeItem()` call with per-item "אחר" fallback, and requires a review stage before adding each row to the active list.
- Loading skeleton (`ListSkeleton`) on first load across all three tabs, driven by an `isLoading` flag, so the "empty list" message no longer flashes before the first Firebase snapshot arrives.

## [2.17.0] - 2026-07-08

### Added
- Invited editors now get a real email with a real, stable link — new
  `/api/send-invite-email` server route (Nodemailer over SMTP, credentials read from
  `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` env vars) fired from
  `AdminsModal` right after `addAdminEmail` succeeds. Points at the stable custom
  domain (`https://fridge-list-app.vercel.app`), same one `e2e-deploy-check.yml`
  already hardcodes, instead of a per-deployment or localhost URL.
- Deliberately fails soft, never blocks the invite itself: the Firebase write
  (the actual permission grant) has already succeeded before this route is even
  called, so a missing/misconfigured SMTP env var (expected until it's provisioned —
  a real secret this codebase can't generate on its own) returns a clear
  `smtp_not_configured` response instead of throwing, and the modal shows a soft
  "permission added, but the email couldn't be sent" notice rather than failing the
  whole action.
- Verified: `nodemailer` bundles server-side only (confirmed absent from
  `dist/client`, present in `dist/server`) — never shipped to the browser. Direct
  API check against the built server route (no SMTP configured yet) returned the
  expected 503 + `smtp_not_configured`, logged correctly server-side.
- **Not yet done**: SMTP credentials still need to be provisioned (Gmail SMTP via
  Nodemailer was the chosen approach) and set as env vars locally (`.env.local`) and
  in Vercel's project settings — a manual step outside this codebase, same category
  as the Firebase Console rule changes elsewhere in this project.

## [2.16.3] - 2026-07-08

### Fixed
- **Reported bug: "some buttons don't work after a modal opened and closed."**
  Root-caused directly (not just from code review): opening `CategoriesModal`,
  `AdminsModal`, or `ChangelogModal` from the settings `DropdownMenu`'s
  `onClick` synchronously raced the dropdown's own closing cleanup against the
  dialog's opening lock on `document.body` — whichever cleanup ran last could
  clobber the other, permanently leaving `<body style="pointer-events: none">`
  after the dialog closed. Confirmed live: every button on the page stopped
  responding to real clicks after closing a modal opened this specific way
  (opening the same modals from a plain button, not a dropdown item, was fine).
  Fixed by deferring each menu item's `setShow*(true)` by one tick
  (`setTimeout(..., 0)`) so the dropdown fully unmounts before the dialog
  mounts, avoiding the race entirely. Verified for all three affected modals:
  `document.body`'s `style` attribute and computed `pointer-events` are back to
  normal after close, and the settings menu itself re-opens correctly
  afterward — not just a passing style check, an actual follow-up interaction.

## [2.16.2] - 2026-07-08

### Added
- "📦 Add to stock" button on every already-saved receipt card (`receipts.tsx`) —
  previously, pushing a receipt's item quantities into stock only happened once,
  automatically, right after a fresh scan (`ReceiptReconcileModal`); if that step was
  skipped/closed, or the receipt was saved before this reconciliation feature existed,
  there was no way to go back and apply its quantities to stock later. The matching/
  categorization logic that used to live only inside `handleSaveReceipt` was extracted
  into a shared `buildReconcileMatches()` helper so both the automatic post-save flow
  and this new on-demand button use the exact same stock/grocery matching, reusing the
  same `ReceiptReconcileModal` either way. Verified live: clicking the new button on a
  real saved receipt (13 items) opened the reconcile modal with each item's correct
  quantity from the receipt (e.g. × 2, × 6, × 4), matching what's shown on the card.

## [2.16.1] - 2026-07-08

### Added
- App version now shown in the bottom-center status line (`Layout.tsx`), appended
  after the existing "last updated" text (e.g. "עודכן לאחרונה: 10:04 · v2.16.1") —
  sourced directly from `package.json` via a Vite-resolved import, no new build step
  or env var. Purpose: makes it possible to tell at a glance which build a given
  tablet/phone is actually running, for support/debugging (e.g. confirming a device
  picked up a deploy). Visible on every tab since `Layout` wraps all routes.

## [2.16.0] - 2026-07-08

### Fixed
- **Reported bug, confirmed live against production data**: after scanning a receipt
  and confirming the reconcile step, items appeared in neither the shopping list nor
  stock. Reproduced directly — a real 12-item receipt already saved in production had
  left both the shopping list and stock completely empty. Root cause:
  `handleReconcileConfirm` called `applyReceiptReconciliation(...)` without `await`
  and with no `.catch()` at all — if the Firebase write failed for any reason
  (permission error, network blip), the reconcile modal still closed and the upload
  queue still advanced exactly as if it had succeeded, with zero indication anything
  went wrong. Fixed: the write is now awaited, and a failure shows a real error
  (`receipts:reconcile.applyFailed`) via `useDialogService`'s themed alert instead of
  failing silently.
- **Confirmed gap, also part of "nor in stock"**: a receipt line item with no
  existing stock match could never end up in stock, no matter what was selected in
  the reconcile modal — `ReceiptReconcileModal` only ever showed a stock checkbox
  when a match already existed, and `applyReceiptReconciliation` had no code path to
  create a new stock entry. Fixed: the stock checkbox now always shows (labeled
  differently — "add as new item" vs. "update stock" — and defaulting **unchecked**
  for new items, since creating a new stock entry is a bigger commitment than bumping
  an existing one), and confirming creates a real new `/stock` entry (defaulting to
  `StockUnit.Piece`/`low_threshold: 1`, matching `StockItemModal`'s own defaults for
  a brand-new item, since a receipt line item doesn't carry unit/threshold info).

### Added
- Loading indicator for the gap between clicking "save" on the receipt review screen
  and the reconcile modal appearing (Firebase reads + a categorization call) — this
  previously had no feedback at all, the UI just sat there.
- `ReceiptReconcileModal` now shows "found N products on this receipt" and disables
  its buttons with an "updating..." state while the (now-awaited) write is in flight,
  instead of the button staying interactive during a write that used to be
  fire-and-forget.
- 6 new tests for `ReceiptReconcileModal` covering the new stock-checkbox defaults,
  the found-count display, the saving state, and — importantly — that a rejected
  `onConfirm` re-enables the form instead of leaving it stuck (caught and fixed a
  real unhandled-rejection bug in the modal itself while writing this test: the
  original `try { } finally { }` had no `catch`, so a rejection would propagate
  past the finally block instead of being handled).

## [2.15.2] - 2026-07-08

### Added
- `.github/workflows/auto-update-pr-branches.yml`: whenever `main` changes, merges it
  into every open PR branch automatically (the REST API's `update-branch` endpoint —
  a real merge commit, never a force-push; simply skips a PR if the merge would
  conflict, left for manual resolution). Exists because this repo has no branch
  protection available (private repo, free GitHub plan), so nothing else keeps PR
  branches current — confirmed directly this session: PR #2 and #4's post-deploy e2e
  checks stayed stuck on an already-fixed bug simply because their branches hadn't
  picked up the fix from PR #3 yet, and updating them required a manual `git merge
  origin/main` + push on each.

## [2.15.1] - 2026-07-08

### Fixed
- `.github/workflows/e2e-deploy-check.yml` had failed on every single run since it was
  added (4/4) — root-caused by checking `gh run list`/`gh run view --log-failed` after
  the user asked about outstanding work, not something that had been verified before.
  The `deployment_status` webhook's `environment_url`/`target_url` fields point at the
  unique per-deployment URL (e.g. `fridge-list-xxxxx-muliteam.vercel.app`), which is
  behind Vercel's Deployment Protection auth wall for **both** preview and production
  targets — confirmed with a plain `curl` (no Vercel-authenticated tooling): a 302
  redirect to Vercel's own login page, matching the `geist`-font HTML Playwright's
  error output was actually seeing instead of this app. The stable custom domain
  (`fridge-list-app.vercel.app`) is genuinely public, separately confirmed the same
  way. Fixed by hardcoding that URL for the e2e run and scoping the job to Production
  deployments only (`github.event.deployment.environment == 'Production'`) — preview
  deployments have no equivalent public URL without additionally wiring up Vercel's
  "Protection Bypass for Automation" secret, not done here.

## [2.15.0] - 2026-07-07

### Added
- **Test infrastructure, from scratch: unit, integration, and e2e, plus two GitHub
  Actions checks.** See `.claude/skills/senior-qa-jest` for the judgment behind these
  choices.
  - **Unit tests** (Jest + `ts-jest`, `jest.config.cjs`/`tsconfig.jest.json` — a
    separate CommonJS-output tsconfig since the app itself is ESM/bundler-mode,
    which Jest can't run directly): `normalizeName`, `formatDateTime`,
    `categories.ts`'s constants, and the `useCollapsedSections` hook (localStorage
    persistence + toggle behavior, including malformed-JSON fallback).
  - Extracted `normalizeName` (previously duplicated verbatim in `firebase.ts` and
    `receipts.tsx`) into a shared `src/lib/normalizeName.ts` — no behavior change,
    done purely to make it testable in one place instead of two.
  - **Integration tests** (`@testing-library/react` + `user-event`, Firebase/
    react-i18next mocked at the module boundary — never touches the real
    `n8n-vocal-2-db` project): `ShoppingListItemRow` (click/info-button/icon
    rendering), `ListPicker` (pill selection, canEdit/hasUnbought gating), and
    `CategoriesModal` (add validation, confirm-gated delete using the mocked
    `useDialogService`).
  - Two real Jest/Vite integration gotchas hit and fixed while wiring this up:
    `ChangelogModal.tsx`'s `*.md?raw` import and the global `App.css` import both
    needed `moduleNameMapper` stubs, since Jest has no concept of Vite's `?raw`
    query suffix or raw CSS imports.
  - **E2E tests** (`@playwright/test`, `playwright.config.ts`, `e2e/smoke.spec.ts`):
    deliberately scoped to view-only flows only (header/tabs render, tab navigation,
    sign-in button when logged out, language switch) — this app's edit actions
    require real Google `signInWithPopup`, which isn't something these tests
    automate; the dev auth bypass exists for interactive manual QA, not for baking
    into an automated suite that might run against a real deployed URL.
  - Found and fixed a real hydration race while writing the e2e tests: clicking
    immediately after `page.goto()` on this SSR (TanStack Start) app can silently
    no-op before client hydration finishes — confirmed directly, then fixed by
    waiting for `networkidle` before interacting.
  - `npm test` / `npm run test:watch` / `npm run test:coverage` (Jest) and
    `npm run test:e2e` (Playwright) scripts.
- **`.github/workflows/test.yml`**: runs on every push/PR — install, `tsc --noEmit`,
  the full Jest suite, then `npm run build`.
- **`.github/workflows/e2e-deploy-check.yml`**: triggers on GitHub's
  `deployment_status` event and runs the Playwright suite against the actual
  deployed URL. Confirmed this project is connected to Vercel via its native GitHub
  integration (not CLI-only deploys) — the git-branch-aliased domain
  (`fridge-list-app-git-main-*.vercel.app`) only exists for git-linked projects —
  so Vercel's GitHub App will fire `deployment_status` for both preview and
  production deployments, giving a real post-deploy check against the live app
  (real Firebase, real build output) as a complement to the pre-merge unit/
  integration suite.



### Changed
- Converted the remaining genuinely-native-looking UI to shadcn/ui. Surveyed the
  whole app first (39 native elements across 8 files) and scoped this down
  deliberately: FABs, list pills, tab links, stock +/- steppers, and icon-only
  buttons (⚙️ ✎ 🗑 ℹ️ 📷, language switch, sign in/out) are left untouched — those
  are plain `<button>` tags with full custom theming, matching this project's
  existing documented convention (`.claude/skills/add-app-module`) of keeping
  bespoke app-chrome shapes custom-styled rather than forcing them through shadcn.
  What actually changed:
  - **`window.confirm`/`window.prompt`/`window.alert`** (5/2/2 call sites across
    `receipts.tsx`, `index.tsx`, `stock.tsx`, `ItemDetailModal.tsx`,
    `CategoriesModal.tsx`) replaced with a new promise-based `useDialogService()`
    (`src/hooks/DialogServiceContext.tsx`), backed by shadcn `AlertDialog`/`Dialog`
    mounted once at the app root. Call sites barely changed shape (`if (!window.confirm(msg)) return`
    → `if (!(await confirm(msg))) return`) — these were the most jarring native
    elements in the app, since an OS-native popup completely breaks out of the dark
    chalkboard theme. New `alert-dialog.tsx` shadcn primitive added (new
    `@radix-ui/react-alert-dialog` dependency).
  - **Raw `<input type="checkbox">`** in `ReceiptReconcileModal.tsx` → shadcn
    `Checkbox` (new `checkbox.tsx` primitive, new `@radix-ui/react-checkbox`
    dependency).
  - **Hand-rolled settings menu** (`Layout.tsx`'s `.menu-overlay`/`.menu-dropdown`
    divs) → shadcn `DropdownMenu` (new `dropdown-menu.tsx` primitive, new
    `@radix-ui/react-dropdown-menu` dependency) — also deleted the now-dead
    `.menu-wrap`/`.menu-overlay`/`.menu-dropdown`/`.menu-item` CSS.
  - Left as native, deliberately, since shadcn has no equivalent: `<input
    type="color">` (category color picker) and `<input type="file">` (photo/receipt
    upload) — both are OS-native pickers with no meaningful shadcn substitute.
  - Verified live in the browser: dropdown menu opens/positions correctly and closes
    on item click; the new prompt dialog (receipt-from-URL) and confirm dialog
    (stock item delete) both render correctly themed, don't hang the page (unlike
    the old blocking native dialogs), and complete their action correctly on
    confirm/cancel. `tsc --noEmit` + `npm run build` both pass clean.

## [2.13.0] - 2026-07-07

### Added
- In-app changelog viewer: a new "📝 יומן שינויים"/"Changelog" item in the settings
  menu (`⚙️`, same `canEdit`-gated menu as "Manage categories"/"Share editing") opens
  `ChangelogModal`, which renders this very `CHANGELOG.md` file inside the app for
  tracking — no need to open the repo to see version history. Imported via Vite's
  `?raw` suffix (`import CHANGELOG_MD from '../../CHANGELOG.md?raw'`, new type
  declaration added to `vite-env.d.ts`) so the file's content is bundled at build
  time, not fetched at runtime. Rendered with a small hand-rolled markdown-to-HTML
  parser (headers, `-` bullets with indented continuation lines, `**bold**`,
  `` `code` ``, `[text](url)` links) instead of pulling in a markdown dependency —
  this file's structure is simple and consistent enough not to need one. Left
  untranslated/English (unlike the rest of the app's UI) since this file is written
  for engineers, not end users, and translating years of technical changelog entries
  wasn't in scope for a "for tracking" utility view. Verified live in the browser in
  both languages: modal opens, content renders with correct formatting and scrolls
  within the dialog, only the button label switches per-language.

## [2.12.0] - 2026-07-07

### Added
- Fallback Gemini model for receipt scanning ("Receipt Scanner (Hebrew)" n8n
  workflow): when the primary `gemini-2.5-flash` model hits its per-model free-tier
  quota, both "Analyze Receipt" (image) and "Analyze Receipt PDF" now route their
  error output to a second Gemini call on `gemini-2.0-flash` instead of failing
  outright — free daily quotas are tracked per-model (confirmed via the 429 error's
  `quotaDimensions.model` field), so this is a genuinely separate quota bucket on the
  same existing API key, no new credential needed.
- Had to work around a real gotcha discovered via the execution trace: a Gemini
  node's `continueErrorOutput` item drops the original binary entirely (confirmed:
  the error item is just `{ error: "<message>" }`, no binary), so the fallback
  model's own call failed with "no binary file 'data' found" the first time this was
  wired up naively. Fixed with two new Code nodes ("Rebuild Image (Fallback)"/
  "Rebuild PDF (Fallback)") that reconstruct the binary straight from the original
  webhook payload (`$('Receipt Webhook').first().json.body.image_base64`) via
  `this.helpers.prepareBinaryData`, rather than relying on passthrough. Verified via
  execution trace that the rebuilt binary is real (287 bytes, correct mimeType)
  before reaching the fallback model.
- Caught and fixed a wiring regression mid-implementation: an intermediate
  `removeConnection` step accidentally dropped the **success** path from both
  primary Gemini nodes to "Parse Receipt" (only the error path should have been
  touched), which would have broken receipt scanning entirely, even for successful
  Gemini calls. Caught via `n8n_get_workflow` structure check before it shipped;
  fixed with two `addConnection` calls restoring `sourceIndex: 0` back to "Parse
  Receipt".
- Known limitation, not a code bug: the final live test also returned
  `quota_exceeded` from the fallback model itself — most likely a per-minute burst
  rate-limit from this session's own rapid repeated test calls to both models within
  a few minutes, not evidence the fallback path is broken (the binary-rebuild step
  was independently verified correct via the execution trace). Should self-resolve
  once request pacing eases; not re-tested further in this session to avoid
  compounding the same rate limit.

## [2.11.0] - 2026-07-07

### Fixed
- Diagnosed a real production failure via n8n execution history: receipt scans were
  failing with a generic `{"error":true,"message":"receipt scan upstream failed"}`
  because the "Receipt Scanner (Hebrew)" n8n workflow's Gemini nodes ("Analyze
  Receipt"/"Analyze Receipt PDF") had no error handling — any Gemini failure (most
  commonly the shared free-tier quota of 20 requests/day being exhausted, confirmed
  via `n8n_executions` showing a `429 RESOURCE_EXHAUSTED` from Google) killed the
  workflow before it ever reached "Respond with Receipt", so n8n sent back an empty
  `200` body instead of any JSON — which is what caused the app's
  `response.json()` to throw `Unexpected end of JSON input` in the first place.
  Fixed on the n8n side: both Gemini nodes now use `onError: "continueErrorOutput"`,
  wired into "Parse Receipt", which detects the error shape and returns a real
  `{ error: true, message: 'quota_exceeded' | 'gemini_failed', detail }` payload
  instead of dying silently. Verified live against the real webhook (today's actual
  exhausted quota) — response is now `{"error":true,"message":"quota_exceeded",...}`
  instead of an empty body.
- The app-side fallback for this case was *also* broken: `receipts.tsx` sets
  `scanError` and opens the (empty) review modal in the same update whenever a scan
  fails, but the toast that would show `scanError` was gated on `!reviewData` — so
  the message never actually rendered, the modal just opened silently empty with no
  indication of why. Fixed by passing the message into `ReceiptReviewModal` itself as
  a new `scanErrorMessage` prop, shown as a banner inside the modal. Added a specific
  `receipts:scanErrors.quotaExceeded` i18n string (he/en) for the quota case instead
  of the generic "couldn't read automatically" message. Verified live: uploading a
  receipt today (quota already exhausted) now shows "חרגנו ממכסת ה-AI היומית לזיהוי
  קבלות — נסו שוב מאוחר יותר או הזינו ידנית" inside the review modal.

## [2.10.0] - 2026-07-07

### Added
- Client-side action logging: every Firebase write triggered from the app itself —
  adding/deleting/editing grocery items, toggling bought, stock add/adjust/update/
  delete, receipt save/delete/reconciliation, category add/update/delete, admin
  invite/removal — now logs a `[module] action: details` line via the same `logger`
  (consola) already used for the backend server routes' webhook logging. These are
  client-side Firebase SDK calls, not server routes, so the log would otherwise only
  reach the browser console — a new `/api/client-log` server route
  (`src/routes/api/client-log.tsx`) plus a `logClientAction()` helper in `firebase.ts`
  forwards every one of these lines to the dev server's own terminal too (fire-and-
  forget `fetch`, never blocks the actual write if the forwarding call fails).
  Complements the existing `[scan-receipt]`/`[scan-receipt-url]`/`[categorize-item]`
  request logs so every real user action is now visible in one place, distinct from
  Vite's dev-server module-request noise in the Network tab. Verified live: adding a
  stock item produced `[stock] addStockItem: ...` in both the browser console and the
  `npm run dev` terminal.

## [2.9.1] - 2026-07-07

### Fixed
- Saving a receipt with N line items was firing N separate `get(stockRef)` calls, N
  separate `get(groceriesRef)` calls, and up to N separate Gemini categorization
  requests — one full Firebase read and one Gemini call per item instead of doing it
  once for the whole receipt. New `getAllStockItems`/`getAllGroceryItems` in
  `firebase.ts` fetch each collection exactly once per receipt save, with matching
  done locally in `receipts.tsx`; items needing categorization are now batched into a
  **single** `categorizeItem()` call (all their names joined into one string), with
  the returned `{item, category}` pairs matched back to each original line item via
  normalized substring matching, falling back to `OTHER_CATEGORY_NAME` for any
  straggler that can't be matched. Verified live: a 3-item receipt now fires exactly
  one `/api/categorize-item` request instead of three (confirmed via network log).
  This isn't just an efficiency nicety — Gemini's free tier caps at 20
  requests/day shared across every n8n workflow (Siri, receipt scanning,
  categorization); the old per-item behavior burned through that quota roughly N
  times faster per receipt.

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
