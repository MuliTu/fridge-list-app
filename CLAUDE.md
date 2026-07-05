# CLAUDE.md — Context for Claude Code

This file exists to bring a fresh Claude Code session up to speed on this project without
re-deriving everything from scratch. Read this before making changes.

**Versioning**: every notable change bumps `package.json`'s version and gets an entry in
[`CHANGELOG.md`](CHANGELOG.md) — check there for a chronological "what shipped when"
view; this file stays organized by topic/module instead.

## What this project is

A voice-driven, shared family shopping list, in Hebrew.

**Flow:** Siri (iOS Shortcut) → n8n webhook → Gemini extracts + categorizes items from
free-form speech → dedup/reactivation logic → Firebase Realtime Database → a live React
web app displays the list on a fridge tablet, grouped by category, with checkboxes.

## Architecture

```
iPhone (Siri Shortcut, dictation)
   → POST https://whiny-idealist-unseen.ngrok-free.dev/webhook/siri-groceries
   → n8n workflow "Siri → Groceries List (Hebrew)"  (id: xa3vWIimtG37EPKM)
       1. Siri Webhook          – receives { text: "<hebrew dictation>", person?: "<name>" }
                                  `person` is optional, per-Shortcut (each family member
                                  hardcodes their own name in their own copy of the
                                  Shortcut — see README's Shortcut setup section).
                                  Backward compatible: absent `person` behaves exactly
                                  as before.
       2. Extract Groceries     – Google Gemini node, extracts + categorizes items,
                                  outputs JSON array [{item, category}, ...]
       3. Parse Items           – Code node: parses Gemini's raw output, validates
                                  categories, fetches current /groceries from Firebase
                                  via `this.helpers.httpRequest` (NOT $helpers — that
                                  throws "not defined" in this instance's task runner),
                                  and decides insert vs. update vs. skip per item:
                                    - not on list yet           → action: insert
                                      (stamps created_by from webhook body.person,
                                      null if absent)
                                    - on list, already bought    → action: update
                                      (reactivates it — sets bought:false again;
                                      does NOT touch created_by — reactivating an item
                                      doesn't change who originally added it)
                                    - on list, not yet bought    → skip (no duplicate)
                                  if nothing to do, emits a single { action: 'none' } item
                                  so the response pipeline still fires.
       4. Route Action          – Switch node, branches on $json.action
                                  (insert / update / fallback→"none")
       5a. Insert to Firebase   – HTTP POST  .../groceries.json
       5b. Update to Firebase   – HTTP PATCH .../groceries/{key}.json  (bought:false)
       6. Build Response        – Code node: builds a Hebrew confirmation sentence
       7. Respond to Siri       – responds with { "response": "<hebrew text>" } as JSON
                                  (plain text responses get mangled/mojibake'd by iOS
                                  Shortcuts — JSON is always UTF-8 and avoids this)
   ← Siri speaks the JSON's "response" field back to the user

Web app (receipt scanning, see module docs below)
   → POST /api/scan-receipt (same-origin — see api/scan-receipt.js below, NOT the
     n8n URL directly; the browser never sees the n8n URL, see Security note below)
   → api/scan-receipt.js (Vercel serverless function) forwards server-side to
     → POST https://whiny-idealist-unseen.ngrok-free.dev/webhook/receipt-scan
   → n8n workflow "Receipt Scanner (Hebrew)"  (id: hqbxddY1YfH9r5FK) — separate workflow,
     separate webhook path, does not touch the Siri workflow or its webhook at all
       1. Receipt Webhook   – receives { image_base64: "<base64 JPEG>" }
       2. Base64 to Image   – Convert to File node (toBinary), turns the base64 string
                              into a binary field ("data") the Gemini node can read
       3. Analyze Receipt   – Google Gemini node, resource=image/operation=analyze,
                              binary input, same Gemini credential as the Siri flow,
                              prompted to return one strict JSON object (store_name,
                              items: [{name, price, quantity}], total) — no markdown
       4. Parse Receipt     – Code node: extracts Gemini's raw text (same defensive
                              multi-shape parsing as "Parse Items"), strips markdown
                              fences, JSON.parses it, returns { error: true, ... } on
                              parse failure instead of throwing, so the web app can fall
                              back to manual entry
       5. Respond with Receipt – responds with the parsed JSON directly
   ← web app receives { store_name, items, total } (or { error: true }) and opens the
     review/edit screen — nothing is written to Firebase from n8n; the web app writes
     to `/receipts` itself only after the user reviews/edits and confirms

Web app (receipt-from-a-URL, see module docs below — separate path from the photo flow)
   → POST /api/scan-receipt-url { url } (same-origin, not n8n directly)
   → api/scan-receipt-url.js (Vercel serverless function) fetches the given URL
     server-side, extracts/strips it down to plain text, forwards that text to
     → POST https://whiny-idealist-unseen.ngrok-free.dev/webhook/receipt-url-scan
   → n8n workflow "Receipt URL Parser (Hebrew)"  (id: oWm6trBDl06KHM1N) — separate
     workflow from both the Siri flow and the photo-based Receipt Scanner
       1. Receipt URL Webhook  – receives { text: "<scraped/stripped page text>" }
       2. Extract From Text    – Google Gemini node, resource=text/operation=message
                                 (same mode as Siri's "Extract Groceries", not the
                                 image-vision mode — this is already text, not a photo)
       3. Parse URL Receipt    – Code node, same defensive parsing pattern as the
                                 photo flow's "Parse Receipt"
       4. Respond with URL Receipt – responds with the parsed JSON directly
   ← same { store_name, items, total } / { error: true } shape as the photo flow, same
     review-before-save screen client-side

Firebase Realtime Database (n8n-vocal-2-db, europe-west1)
   /groceries/{pushId} = { item, category, bought, added_at, raw_text }
   /categories/{key} = { name, color, icon, protected }   ← now the live source of
                        truth for the web app (see Categories module below). n8n's
                        Siri workflow still hardcodes its own separate copy — narrowed
                        known gap, see Known gaps below.
   /stock/{pushId} = { name, category, quantity, unit, low_threshold, updated_at,
                        updated_by }   ← inventory module, only touched by the web app
                                          (n8n never writes here)
   /receipts/{pushId} = { image_url, store_name, items: [{name, price, quantity}],
                           total, scanned_at, scanned_by }   ← receipt scanning module,
                                          only touched by the web app
   /admins/{key} = "someone@gmail.com"   ← additional editor emails invited from the
                        app UI, on top of the permanent hardcoded ADMIN_EMAILS owner(s)

React app (fridge-list-app/) — live display, runs on a tablet browser and on phones
   Tab switcher (real routes, `src/routes/`): "רשימת קניות" (shopping list, `index.tsx`)
   / "מלאי" (stock, `stock.tsx`) / "קבלות" (receipts, `receipts.tsx`).
   Listens to /groceries (and /stock or /receipts, on their respective tabs) via
   onValue() realtime listener — no auth required to view any of them.
   Groups by category (editable set, live from /categories — see Categories module below).
   Checkbox per item writes back bought:true/false via setBought() in src/lib/firebase.ts —
   disabled unless signed in with an allowed Google account (see Auth below).
   Toast banner + highlight animation when new items arrive.
   Tapping an item opens ItemDetailModal: shows note/image/created/modified metadata to
   everyone; editing note/image or deleting the item requires sign-in.
   Responsive: single-column board + full-page scroll below 640px, tablet dashboard
   layout (fixed height, internal scroll per panel) above it.
```

## Auth (Google sign-in, view/edit split)

Deliberately **not** a full app gate — the tablet display must stay glanceable without
login friction, matching the original "low-stakes family list" tradeoff. Instead:

- **Viewing the list requires no auth at all** — `groceriesRef` / `onValue` in
  `src/lib/firebase.ts` are unconditional. Realtime Database rules are unchanged (still the
  open rules below) specifically so n8n's unauthenticated REST writes keep working.
- **Editing (bought toggle, note, image, delete) requires Google sign-in** AND the
  signed-in email must be in `ADMIN_EMAILS` (`src/lib/firebase.ts`) — currently just
  `muli.turiel@gmail.com`. To add a second household member (e.g. a spouse), just add
  their Google email to that array; no other change needed.
- `src/hooks/AuthContext.tsx` (`AuthProvider`/`useAuth`) provides `user`, `canEdit`,
  `onSignIn`, `onSignOut`, `authError` via React context to every route. There is no
  "sign-in wall" screen — viewing never requires auth.
- **Uses `signInWithPopup`, not `signInWithRedirect`.** Redirect was tried first and
  hung indefinitely with no error and no navigation — confirmed via network trace that
  it stalls loading Firebase Auth's cross-origin `__/auth/iframe` on `authDomain`
  (`n8n-vocal-2-db.firebaseapp.com`, a different origin than wherever the app is
  served), which modern Chrome's third-party storage restrictions can silently block
  forever. `signInWithPopup` avoids that hang. If you ever revisit redirect-based auth,
  expect to hit this again unless the app is served from a domain that matches
  `authDomain` (e.g. via Firebase Hosting).
- **Every domain the app is served from must be added to Firebase's "Authorized
  domains" list** (Console → Authentication → Settings → Authorized domains) or Google
  sign-in fails with `auth/unauthorized-domain` — this applies to `signInWithPopup`
  just as much as redirect. Not something doable from this codebase (no Admin/service-
  account credentials — see Blaze/Storage note below for why that was never set up).
  `localhost` is on the list by default; **`fridge-list-app.vercel.app` needs to be
  added manually** after the Vercel deploy, and again for any future custom domain.
- Images upload to **Firebase Storage** (`src/lib/firebase.ts` `saveItemDetails`), resized
  client-side to ~1280px/JPEG q0.75 via canvas before upload. This requires the Firebase
  project to be on the **Blaze plan** with Storage enabled (Spark/free plan can't use
  Storage at all) — a manual Console step, not something done from this codebase.
  Storage's own security rules (separate from the Realtime Database's) should require
  `request.auth != null`, since Storage is a new surface only touched by the
  authenticated web app — see the rule snippet kept in this session's plan file if you
  need to re-apply it.

## Data model (`/groceries/{pushId}`)

```
{
  item, category, bought, added_at, raw_text,   // ← from n8n, unchanged
  note,               // string | null — editable via ItemDetailModal
  image_url,          // Storage download URL | absent
  modified_at,        // ISO string — stamped on every web-app write (bought/note/image)
  modified_by,        // email of whoever made that edit
  list_name,          // string | absent — absent/null = the permanent household list,
                       // any other string = a custom/temporary list (e.g. "מסיבה")
  created_by          // email — only present on items added via the web app's own
                       // add-item flow (custom lists); Siri-added items never set this
}
```

`created_by` is only populated for items added through the web app itself (custom
lists, and the stock module's "add to shopping list" button) — n8n doesn't stamp an
email, so the UI falls back to labeling Siri-added items as "Siri" using the existing
`added_at` field as the "created" timestamp. There's no way today to tell *which*
family member's phone triggered a given Siri addition (the Shortcut only sends
`{ text }}`, no identity) — flagged as a known gap below if that ever needs to become
traceable.

## Custom/temporary lists (`list_name`)

Added for one-off events (a party, a trip) that shouldn't clutter or get mixed into the
permanent household list. Full design discussion in
[`CONVERSATION.md`](CONVERSATION.md)'s Session 3 — tag-based was chosen deliberately
over a fully separate lists/collections model, to keep this small and reversible.

- A grocery item's `list_name` field is `null`/absent for the permanent list, or any
  other string for a custom list. There is no separate `/lists` collection — a custom
  list only "exists" in the sense that at least one item currently carries that tag
  (`src/routes/index.jsx`'s `?list=` search param can still reference a brand-new,
  still-empty list name before the first item is added to it).
- UI: a pill row (`src/routes/index.jsx`, `.list-picker`) below the tab switcher, shown only on
  the shopping-list tab — stock is untouched by this feature entirely. Pills are
  derived from the distinct `list_name` values currently in use, plus "+ רשימה חדשה"
  (prompts for a name via `window.prompt`, matching the existing lightweight-dialog
  pattern already used for deletes).
- Since Siri/n8n has no concept of "current list" (the Shortcut only ever sends
  `{ text }`), it always writes untagged items to the permanent list. **Custom lists
  can only be populated from the web app itself** — a "+" FAB
  (`src/components/GroceryItemModal.tsx`) appears only while viewing a non-permanent list.
- Deleting a custom list (`deleteGroceryList` in `src/lib/firebase.ts`) is a bulk,
  destructive action — it removes every item tagged with that `list_name` in one
  atomic multi-path Firebase `update()`, behind a confirm dialog that states the item
  count. There's no undo.

## Collapsible category sections (`useCollapsedSections`)

`src/hooks/useCollapsedSections.ts` is a small shared hook (one `localStorage` key,
`collapsedCategories`) used independently by both `src/routes/index.tsx` (shopping
list) and `src/routes/stock.tsx` (stock) — collapsing a category collapses it by name on **both**
tabs on that device. This is a client-only UI preference, not household data: it's
never written to Firebase, so collapsing something on the tablet has no effect on
anyone's phone. Default is everything expanded, so the tablet's glanceable
walk-by-and-see-the-whole-list use case is unaffected on first load. Collapse state
lives entirely outside the live Firebase data state, so a new snapshot can never reset
it, and the new-item toast/highlight logic is untouched by collapse state since it
never depended on what's currently rendered.

## Receipt scanning & cost tracking (`/receipts/{pushId}`)

Third module, added after a team brainstorm (Session 4 in
[`CONVERSATION.md`](CONVERSATION.md)) deliberately scoped *down* from a much bigger
"AI grocery app" feature dump — see that session for the full reasoning on what was
cut (AI product matching, auto-cart-fill, predictive suggestions, store price
comparison — all parked, not built) versus what was kept (this).

```
{
  image_url,               // Storage download URL for the receipt photo | null
  source_url,               // original link, only for URL-sourced receipts | null —
                             // exactly one of image_url/source_url is set, never both
  store_name,               // string | null — Gemini's guess, editable before save
  items: [{ name, price, quantity }],
  total,                    // number | null
  scanned_at, scanned_by    // ISO string + email, stamped at save time
}
```

Flow: canEdit-only "+" upload button (`src/routes/receipts.tsx`) → photo resized
client-side (reusing `resizeImage`, now exported from `src/lib/firebase.ts` for both this
and the existing grocery-item-photo flow) → `scanReceipt()` POSTs the base64 JPEG to
`/api/scan-receipt` (see Architecture above and Security note below — **not** the n8n
URL directly) → result opens in `src/components/ReceiptReviewModal.tsx`, a mandatory edit screen
showing the original photo alongside every extracted line (name/price/quantity, all
editable, rows addable and removable) — **nothing reaches Firebase until the user
explicitly confirms**. This was the single strongest requirement from Session 4 (Idan,
an end user who'd built receipt scanning before): OCR is never clean, and skipping a
review step before persisting was the most common mistake he'd seen elsewhere. If the
n8n call fails outright (network error, or Gemini's output didn't parse as JSON), the
same review modal still opens, just empty — falling back to fully manual entry rather
than a dead end.

**Security note — why there's a proxy in front of this one webhook**: unlike the Siri
webhook (only ever referenced in docs, never shipped to a browser), this one is called
directly from client code — so if the client called n8n's URL directly, that URL would
ship inside the JS bundle to every visitor, regardless of whether the GitHub repo is
public or private (this was a real finding from this project's security review, logged
in [`CONVERSATION.md`](CONVERSATION.md)). Fix: `api/scan-receipt.js` is a Vercel
serverless function that holds the n8n URL server-side only; the browser calls
`/api/scan-receipt` on the app's own domain, and that function forwards to n8n from the
server. In local dev (`npm run dev`), `vite.config.js` registers a small
`configureServer` middleware plugin that imports and runs the *same* handler file
directly in Vite's own Node process — not a declarative string-proxy — so the n8n URL
still never reaches the browser even locally, and there's only one copy of the request-
forwarding logic to keep in sync between dev and prod. Same request/response shape
either way (`{ image_base64 }` in, the parsed receipt JSON out), so `scanReceipt()` in
`firebase.js` doesn't need to know or care which one is handling it.

**Receipt from a URL** (`api/scan-receipt-url.js`, `scanReceiptFromUrl()` in
`firebase.js`): a second way to add a receipt, alongside the photo flow — paste a link
to a digital invoice (e.g. Shufersal's "green invoice" SMS/email link) instead of
photographing paper. Same proxy reasoning as above, same dev/prod handler-reuse
pattern via the `configureServer` plugin. What the function actually does:
1. Fetches the given URL server-side (CORS-free, since it's not a browser fetch).
2. Some digital-invoice viewer pages (confirmed for Shufersal) render as a mostly-empty
   HTML shell that embeds the *real* receipt data as a JSON blob inside an inline
   `<script>console.log(...)</script>` call — including a `PresignedURL` field, a
   temporary signed S3 link to the actual line-item content. `findPresignedUrl()`
   regex-extracts that field and fetches it too, appending its content. If no such
   field is found (any other site), it just works with whatever the original page gave.
3. Strips HTML tags/entities down to plain text (regex-based, not a full HTML parser —
   deliberately simple, since Gemini's extraction step doesn't need pixel-perfect
   text, just enough signal to find item/price lines) and caps it at 20,000 characters.
4. POSTs that text to a **separate** n8n workflow, "Receipt URL Parser (Hebrew)" (id
   `oWm6trBDl06KHM1N`) — webhook → Gemini in **text** mode (same `resource: text,
   operation: message` shape as the Siri "Extract Groceries" node, not the image-vision
   mode the photo flow uses, since this is already real text, not a photo needing OCR)
   → same defensive JSON-parsing Code node pattern as "Parse Receipt" → responds with
   `{ store_name, items, total }` (or `{ error: true }` on parse failure).
5. Same `ReceiptReviewModal` as the photo flow handles the result — **no exception to
   the "nothing saves without review" rule** just because this path skips a photo.
   When there's no `imageBlob` (this path never has one), the modal shows a "🔗 צפייה
   בקבלה המקורית" link to the original URL instead of an image preview, and
   `saveReceipt()` stores that URL as `source_url` on the receipt instead of
   `image_url` (which stays `null` — no Storage upload happens for link-sourced
   receipts, nothing to upload).

**This is Shufersal-specific reverse-engineering, not a general "any receipt link"
solution** — the `PresignedURL`-in-embedded-JSON pattern was found by inspecting one
real Shufersal invoice link; it's an undocumented internal structure that could change
without notice, and other chains' digital-invoice pages almost certainly look nothing
like this. The generic fallback (strip tags, hand the raw page to Gemini) is a
reasonable best-effort for other sites, but only actually tested against Shufersal's
specific structure.

Price history / diff: `src/routes/receipts.tsx` builds an in-memory map of every item name
(normalized) → its price across all past receipts, computed client-side from the
already-subscribed `/receipts` data (no extra Firebase reads). Each line item shows a
▲/▼ delta against its most recent *prior* price. Matching is exact-name,
trimmed/lowercased — the same known limitation already accepted for `/stock`
(`findStockItemByName`) and Siri's own dedup; not solved differently here. A standalone
`getReceiptPriceHistory(itemName)` also exists in `firebase.js` for one-off lookups
outside the main list render.

Editing/deleting receipts requires `canEdit`, same as everywhere else; viewing the
receipts tab is open, consistent with the rest of the app's auth model.

## Stock / inventory module (`/stock/{pushId}`)

Second module added inside the same app, tracking on-hand quantities per household
item rather than a one-shot shopping list. Design discussion (6 personas: fullstack
engineer, PM, QA, 3 end users) is preserved in full in
[`CONVERSATION.md`](CONVERSATION.md) — read that first if extending this module, it
explains *why* several choices were made (manual "add to shopping list" instead of
auto-push, shared auth model, threshold semantics, etc).

```
{
  name, category,        // category is a live /categories name, see Categories module
  quantity, unit,         // e.g. quantity: 2, unit: 'ליטר'
  low_threshold,          // per-item, user-set — "low stock" when quantity <= low_threshold
  updated_at, updated_by  // stamped on every quantity/edit write, same pattern as groceries
}
```

UI: a tab switcher in `src/Layout.jsx` (real routes now, see "Frontend app" below)
toggles between "רשימת קניות" (`src/routes/index.jsx`) and "מלאי"
(`src/routes/stock.jsx`), grouped by category like the shopping list.
Quantity is changed via +/- stepper buttons (`adjustStockQuantity` in `src/lib/firebase.ts`,
clamped at 0 client-side — not a Firebase transaction, so concurrent taps from two
phones are last-write-wins, an accepted tradeoff for a small household, same as
`bought` already is). Items at/below threshold get a visual low-stock highlight and a
manual "🛒 לרשימה" button (`addStockItemToShoppingList`) that pushes a new entry into
`/groceries` — deliberately not automatic, to avoid fighting with n8n's Siri
dedup/reactivation logic on `/groceries` (see Architecture above). Adding/editing/
deleting stock items (`src/components/StockItemModal.tsx`, one modal for both add and edit — edit
mode is triggered by passing an existing `item`) and adjusting quantity all require
`canEdit`, same as editing the shopping list — viewing `/stock` is open to everyone,
consistent with the rest of the app's auth model (see Auth above).

Each stock item shows a small caption under its name with who last touched it and
when — `עודכן: <date> · <email>`, sourced straight from `updated_at`/`updated_by`
(`formatDateTime` shared with `ItemDetailModal.tsx` via `src/lib/formatDateTime.ts`). There
is no separate "created" stamp for stock items (unlike groceries' `added_at`) — the
first write's `updated_at`/`updated_by` doubles as creation info, which is enough since
nothing here distinguishes "who added" from "who last edited."

**Firebase rule not yet applied**: `/stock` needs the same open `{ ".read": true,
".write": true }` rule as `/groceries`/`/categories` (see Firebase security rules
below) — this is a manual Console step, do it before relying on the stock tab against
the real database.

**Restock-on-checkout** (`src/components/RestockPrompt.tsx`, wired in
`src/routes/index.tsx`'s `handleToggleBought`): checking a shopping-list item off (bought `false → true` only,
not the un-check direction) triggers `findStockItemByName` — a one-off `get()` lookup
against `/stock` matching on trimmed/lowercased `name` (same normalization limits as
the existing shopping-list dedup: "עגבניות" vs "עגבניה" won't match, a pre-existing
known gap, not new debt here). If a match is found, a confirm prompt appears asking how
much to add to that item's stock quantity (defaults to 1, editable) — nothing is
written to `/stock` unless the user explicitly confirms. This is what closes the loop
identified in [`CONVERSATION.md`](CONVERSATION.md)'s post-build check-in: without it,
buying something never restocked it, so the low-stock highlight would silently drift
out of sync with reality.

## Key IDs / endpoints (not secret, safe to reuse)

- n8n instance: `https://whiny-idealist-unseen.ngrok-free.dev` (ngrok — see Known gaps)
- n8n workflow ID: `xa3vWIimtG37EPKM`, name "Siri → Groceries List (Hebrew)"
- Webhook path: `siri-groceries` (POST, body `{ "text": "..." }`)
- Firebase project: `n8n-vocal-2-db`
- Firebase databaseURL: `https://n8n-vocal-2-db-default-rtdb.europe-west1.firebasedatabase.app`
- Gemini model: `models/gemini-2.5-flash`, credential name "Google Gemini(PaLM) Api account"

## Categories module (`/categories/{key}`, `src/hooks/useCategories.ts`)

Categories used to be hardcoded in three places (n8n's Gemini prompt, n8n's
`VALID_CATEGORIES` array, and a static `CATEGORIES` array in the React app) — that's
now down to **two** places, not three. The web app's copy is gone; n8n's two are not
touched by this change (see Known gaps).

```
{
  name,        // display string, matched against item.category everywhere (grocery,
                // stock, receipts don't use categories) — this string IS the identity,
                // not the Firebase key
  color, icon, // hex color + emoji, used for the panel accent/icon
  protected    // true only for "אחר" — see below
}
```

`src/lib/categories.ts` no longer holds the canonical list — it only holds
`DEFAULT_CATEGORIES` (the original 17, now with an `icon` per category) and
`OTHER_CATEGORY_NAME` (`'אחר'`, the hardcoded fallback string used throughout the app).
`src/hooks/useCategories.ts` is the hook every consumer (`routes/index.tsx`,
`routes/stock.tsx`, `StockItemModal.tsx`, `GroceryItemModal.tsx`) now calls instead of importing a static
array — it subscribes to `/categories` live and, on mount, calls
`seedCategoriesIfEmpty()`, which is **defensive**: it only writes `DEFAULT_CATEGORIES`
if the path is currently empty, so it can never clobber real edits after the first run.

`"אחר"` is `protected: true` and the CRUD UI (`src/components/CategoriesModal.tsx`) won't let you
rename or delete it, because the fallback logic hardcodes that literal string
(`categoryMap.has(entry.category) ? entry.category : OTHER_CATEGORY_NAME`) in
`routes/index.tsx` and `routes/stock.tsx`. Deleting any *other* category needs no migration step —
items still tagged with a deleted category's name just fall into "אחר" automatically
via that same existing fallback.

**Known gap, narrowed but not closed**: n8n's Siri workflow ("Extract Groceries"
node's system prompt + "Parse Items" node's `VALID_CATEGORIES` array) still hardcodes
its own separate copy of the categories. Wiring n8n to read `/categories` dynamically
was the long-planned next step (see Known gaps) but is a real change to the *live* Siri
flow and wasn't done alongside this — if you add/rename/delete a category in the app,
Siri won't know about it until n8n is rewired too.

## Editor invites (`/admins/{key}`, "shared list" / `src/components/AdminsModal.tsx`)

`ADMIN_EMAILS` in `src/lib/firebase.ts` remains the permanent, hardcoded owner list — it
can't be edited from the UI, only from source. On top of it, `canEdit` now also checks
a live `/admins` path: any email added there via `src/components/AdminsModal.tsx` (a small
"שיתוף עריכה" panel, opened from a header icon button, admin-only) can sign in with
that Google account and get full edit rights, same as an owner.

**Security tradeoff, deliberately flagged, not hidden**: `/admins` is open-write, same
philosophy as `/groceries`/`/stock`/`/categories`. But unlike those, this path controls
*who is allowed to edit everything else* — so open write here is a real
privilege-escalation surface: anyone who discovers the Firebase config (not secret, by
design) and this exact path could add an email they control and sign in as an editor.
Recommended tightening once this goes public: `"admins": { ".read": true, ".write":
"auth != null" }` — requires *some* signed-in Google account rather than a fully
anonymous write, which doesn't fully close the gap (any Google account holder could
still add themselves) but is strictly better than the current fully-open default. See
Firebase security rules below.

## Firebase security rules (as currently set)

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "groceries": { ".read": true, ".write": true },
    "categories": { ".read": true, ".write": true }
  }
}
```

Deliberately open read/write on just these two paths, no auth — this was a conscious
tradeoff (chosen by the user over setting up a Google service account) since it's a
low-stakes family list. Everything else on the database stays locked down.

**`/stock` and `/receipts` both need the same treatment** (see their module docs
above) — add `"stock": { ".read": true, ".write": true }` and
`"receipts": { ".read": true, ".write": true }` sibling entries. Not yet applied in the
Firebase Console as of this writing; the stock and receipts UI will get
permission-denied errors against the real database until those rules are added.

**`/admins` needs a rule too, but tighter than the others** — see the Editor invites
section above for why. Recommended: `"admins": { ".read": true, ".write": "auth !=
null" }` rather than a fully open `".write": true`. Not yet applied.

**This is unchanged even after adding Google sign-in to the web app** — see Auth above.
The web app enforces edit permission client-side (`canEdit` gate on actions), not via
these DB rules, specifically so n8n's unauthenticated writes don't break. Anyone with
the Firebase config (which is not secret — API keys in client SDKs never are) could
technically still write directly via REST, same as before this session's changes.

## Known gaps / next steps in progress

1. **n8n still doesn't read `/categories`.** The web app now does (see Categories
   module above) — this gap is narrower than it used to be, but n8n's Siri workflow
   still hardcodes its own copy in two places (the Gemini prompt and
   `VALID_CATEGORIES`). Intended next step, unchanged: add a "Get Categories" HTTP GET
   node early in the n8n flow, and rewrite the Gemini system message +
   `VALID_CATEGORIES` to reference its output instead of hardcoded arrays. Until that's
   done, adding/renaming/deleting a category in the app has no effect on how Siri
   classifies new items.
2. **ngrok URL is not stable.** `https://whiny-idealist-unseen.ngrok-free.dev` will
   change if the tunnel restarts, breaking the Siri Shortcut silently. Recommended
   fix: migrate to Cloudflare Tunnel or Tailscale Funnel for a permanent URL.
3. **iOS push notifications for the web app** were discussed but not implemented —
   would require a PWA manifest + "Add to Home Screen" since Safari only supports web
   push for installed PWAs, not plain tabs.
4. No dedup normalization beyond exact-string-match (case-insensitive, trimmed). E.g.
   "עגבניות" and "עגבניה" would be treated as different items.
5. **Siri per-person attribution — n8n side is done, Shortcut side is manual.** The
   webhook/Parse Items/Insert to Firebase nodes now accept and stamp an optional
   `person` field as `created_by` on newly-inserted items (see Architecture above).
   That's live in the n8n workflow. What's *not* done: actually adding `"person":
   "<name>"` to each family member's own copy of the Shortcut — that's a manual step on
   each phone (see README's Shortcut setup section), not something doable from this
   codebase. Until someone updates their Shortcut, their Siri-added items keep showing
   up as "Siri" with no individual attribution, exactly as before. Editing rights
   (`ADMIN_EMAILS` / the editor-invite feature) are a separate, already-solved concern
   — this gap was specifically about knowing *which* person's voice added an item, not
   about who's allowed to edit.
6. **`/stock` Firebase rule not yet applied in the Console.** The code assumes the same
   open `{ ".read": true, ".write": true }` rule as `/groceries`/`/categories` — add it
   manually before the stock tab will work against the real database (see Firebase
   security rules above).

## Frontend app (fridge-list-app/)

**TanStack Start** (React + TanStack Router, file-based routing, Vite/Nitro under the
hood), **TypeScript throughout** (`.tsx`/`.ts`, `strict: false` + `strictNullChecks:
true` — the latter is required by TanStack Router's own types, see `tsconfig.json`).
Still talks directly to Firebase from the browser exactly as before; TanStack Start's
SSR only renders the static shell (header/theme), since `/groceries`, `/stock`,
`/receipts`, `/categories`, `/admins` are realtime `onValue` push subscriptions, not
one-shot fetches, so they deliberately aren't wired through server loaders. Migrated
from a plain Vite SPA in v2.0.0, restructured + converted to TS in v2.2.0 — see
`CHANGELOG.md` for what changed structurally.

```
npm install
npm run dev      # http://localhost:5173
npm run build     # outputs dist/client + dist/server
npx tsc --noEmit  # type check
```

Folder structure:
- `src/routes/` — file-based route tree (must stay at exactly this path, TanStack
  Router convention). `__root.tsx` is the document shell (`<html lang="he" dir="rtl">`,
  fonts, title, `App.css`); `index.tsx` (`/`), `stock.tsx` (`/stock`), `receipts.tsx`
  (`/receipts`) are the three tabs; `api/scan-receipt.tsx` + `api/scan-receipt-url.tsx`
  are the receipt-scanning server routes (`server.handlers.POST`, Web-standard
  `Request`/`Response`) — TanStack Start's dev server serves these natively, no separate
  proxy plugin needed. `src/routeTree.gen.ts` is generated by the router's Vite plugin —
  never edit it by hand, and don't be alarmed by verbose `page reload
  src/routeTree.gen.ts` dev-server log lines; it's a known cosmetic watcher quirk in
  some environments, doesn't affect the app (confirmed via direct browser checks) or
  the production build.
- `src/components/` — shared UI: the modals (`ItemDetailModal`, `GroceryItemModal`,
  `StockItemModal`, `ReceiptReviewModal`, `CategoriesModal`, `AdminsModal`,
  `RestockPrompt`) and `Layout` (header, tabs-as-`<Link>`s, settings menu, mounts
  `GroceriesFeedProvider`).
- `src/hooks/` — `AuthContext` (`useAuth`, Google-popup sign-in), `GroceriesFeedContext`
  (`useGroceriesFeed`, the single shared `/groceries` subscription driving the new-item
  toast + status line visible across all three tabs), `useCategories`,
  `useCollapsedSections`.
- `src/lib/` — `firebase.ts` (all Firebase reads/writes), `formatDateTime.ts`,
  `categories.ts` (default categories + protected-"אחר" constant).
- `src/types.ts` — shared interfaces (`GroceryItem`, `StockItem`, `Category`, `Receipt`,
  `ReceiptItem`, `AuthUser`) reused across lib/hooks/components/routes.

The custom/temporary list picker on `/` is a `?list=` search param
(`Route.useSearch()`/`Route.useNavigate()`) instead of local state, so a custom list is
a shareable/refreshable URL.

**Local-dev auth bypass** (`.env.local`, gitignored, never pushed): set
`VITE_DEV_AUTH_BYPASS=true` + `VITE_DEV_AUTH_EMAIL`/`VITE_DEV_AUTH_NAME` to skip the
real Google popup and sign in as a fake user client-side (see `src/hooks/
AuthContext.tsx`) — useful for exercising `canEdit`-gated flows without a real account.
Only active when `import.meta.env.DEV` is true, so it can never affect a production
build regardless of what's in the env file.

Important: this **must** be served over http(s), not opened as a `file://` URL — the
Firebase SDK is loaded as an ES module, which browsers block on `file://`.

## Debugging tips learned this session

- To inspect live Firebase data without touching the browser, spin up a disposable n8n
  workflow: Webhook → HTTP Request (GET `.../groceries.json`) → Respond to Webhook.
  Delete it when done — don't leave debug workflows active.
- `n8n_validate_workflow` will flag an HTTP Request node's `method` field as invalid if
  you try to set it via expression (`={{ ... }}`) — this node version's `method`
  parameter doesn't support dynamic expressions. Use a Switch/Route node instead to
  pick between fixed-method HTTP Request nodes.
- Inside n8n Code nodes on this instance, use `this.helpers.httpRequest(...)`, not
  `$helpers.httpRequest(...)` — the latter throws `$helpers is not defined` here
  (may vary by n8n version/task-runner config, but confirmed broken on this instance).
- If `signInWithRedirect` appears to do nothing (no error, no navigation, just stays on
  the sign-in button), don't assume it's a code bug — check the Network tab for a stalled
  request to `<authDomain>/__/auth/iframe`. That's Firebase Auth's cross-origin storage
  check, and modern Chrome's third-party-cookie restrictions can hang it forever with no
  error surfaced. Switching to `signInWithPopup` fixed it here. Deploying to a different
  domain (e.g. Vercel) would **not** have fixed this on its own, since `authDomain` stays
  a separate origin either way.
