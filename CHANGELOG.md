# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/), versioned against `package.json`.
Full design/decision history (why, not just what) lives in
[`CONVERSATION.md`](CONVERSATION.md); architecture reference lives in
[`CLAUDE.md`](CLAUDE.md).

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
