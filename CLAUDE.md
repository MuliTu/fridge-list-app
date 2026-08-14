# CLAUDE.md — Context for Claude Code

This file exists to bring a fresh Claude Code session up to speed on this project without
re-deriving everything from scratch. Read this before making changes.

**Versioning**: every notable change bumps `package.json`'s version and gets a
[GitHub Release](https://github.com/MuliTu/fridge-list-app/releases) (tag `vX.Y.Z`,
one-sentence-per-bullet notes) once its PR is merged — check there for a chronological
"what shipped when" view; this file stays organized by topic/module instead. Versioning
moved off a tracked `CHANGELOG.md` file to GitHub Releases on 2026-07-17 — all prior
`CHANGELOG.md` history was converted into Releases (`v1.0.0` through `v2.36.0`) rather
than lost.

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
       3. Is PDF?           – IF node, branches on mime_type
       4. Analyze Receipt (or "Analyze Receipt PDF") – Google Gemini node
                              (models/gemini-2.5-flash), binary input, same Gemini
                              credential as the Siri flow, prompted to return one strict
                              JSON object (store_name, items: [{name, price, quantity}],
                              total) — no markdown. `onError: continueErrorOutput` routes
                              any failure (most commonly quota exhaustion) to a
                              same-credential fallback call on models/gemini-2.0-flash
                              instead of dying silently — see the "Receipt scanning" module
                              section below for why this exists and a real gotcha it hit
                              (the error-output item drops the original binary entirely).
       5. Parse Receipt     – Code node: extracts Gemini's raw text (same defensive
                              multi-shape parsing as "Parse Items"), strips markdown
                              fences, JSON.parses it, returns { error: true, message,
                              detail } on any failure (parse failure or the Gemini error
                              shape above) instead of throwing, so the web app can fall
                              back to manual entry and — for the quota case specifically —
                              show a real "try later" message instead of a generic one
       6. Respond with Receipt – responds with the parsed JSON (or error payload) directly
   ← web app receives { store_name, items, total } (or { error: true, message, detail })
     and opens the review/edit screen — nothing is written to Firebase from n8n; the web
     app writes to `/receipts` itself only after the user reviews/edits and confirms

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

**As of v2.19.0, this is a full app gate** — a real reported incident forced this change:
the owner shared the tablet's plain URL with a friend (a completely reasonable thing to
do with a link), and the friend could see the entire household list with zero
authentication, because viewing was originally designed to be open-by-default (see below
for that original rationale, kept for history since the tradeoff it describes was real,
just superseded by this incident). Now:

- **Viewing the list requires Google sign-in AND being an invited household member** —
  the exact same check `canEdit` already used (`ADMIN_EMAILS` in `src/lib/firebase.ts`,
  plus the live `/admins` path — see Editor invites below). There is currently no
  separate viewer-only tier (a "checker" role between viewer and admin was brainstormed
  in `CONVERSATION.md` Session 5 but explicitly parked, not built), so `canView` and
  `canEdit` are the same boolean today — `src/hooks/AuthContext.tsx` exposes both
  separately anyway, since they represent different capabilities even though they
  currently share one definition.
- `src/components/Layout.tsx` is the actual gate: it renders one of three states —
  `!authResolved` (still checking whether a session already exists — avoids flashing a
  sign-in screen for a returning authenticated user while Firebase resolves that),
  `!user` (a themed "sign in to view this list" screen, no tabs), or `user && !canView`
  (a themed "you don't have access, ask the owner to invite you" screen, no tabs) — only
  the fourth state (`user && canView`) renders the tabs, the routed page, and the
  toast/status line. This is intentionally an **app-level UI gate, not a database-level
  one** — see the Firebase security rules section below for why the RTDB rules
  themselves must stay open regardless (n8n's Siri webhook writes unauthenticated
  directly to `/groceries`), so this doesn't stop someone who directly queries the
  Firebase REST API with knowledge of the project's config — it stops the actual
  reported problem (a casually shared tablet URL exposing the list to anyone who opens
  it), not a determined technical attacker.
- `src/hooks/AuthContext.tsx` (`AuthProvider`/`useAuth`) provides `user`, `canEdit`,
  `canView`, `authResolved`, `onSignIn`, `onSignOut`, `authError` via React context to
  every route.
- **Original rationale, superseded above but kept for history**: viewing was
  deliberately left open so the tablet display could stay glanceable without login
  friction, matching a "low-stakes family list" tradeoff. That tradeoff assumed the
  app's URL would only ever reach trusted household members — the friend-sharing
  incident showed that assumption doesn't hold once a link can be shared casually, so
  the gate above replaces it.
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
  account credentials). `localhost` is on the list by default; **`fridge-list-app.vercel.app`
  needs to be added manually** after the Vercel deploy, and again for any future custom
  domain.
- **Images/PDFs are stored in Firestore, not Firebase Storage.** Storage requires the
  paid Blaze plan; this was confirmed unusable for this project (both possible bucket
  names — `n8n-vocal-2-db.appspot.com` and `n8n-vocal-2-db.firebasestorage.app` —
  return `NoSuchBucket` when queried directly against Cloud Storage) and the user
  explicitly doesn't want to pay for it. Firestore is free on the **Spark** plan, so
  `src/lib/firebase.ts`'s `saveImageDoc`/`getImageDataUrl`/`deleteImageDoc` helpers
  store resized images (grocery item photos, `saveItemDetails`) and receipt photos/PDFs
  (`saveReceipt`) as base64 strings in Firestore documents instead — `groceryImages/{grocery
  item key}` and `receiptImages/{receipt key}` collections, one doc per image, id always
  matching the owning record's own Realtime Database key so lookups/deletes need no
  extra pointer field beyond `image_ref` (which is set to that same key on the RTDB
  record once the image is saved). Firestore caps documents at 1MiB; base64 inflates
  size by ~4/3, so `MAX_INLINE_IMAGE_BYTES` (700KB raw) guards against that — a file
  over the cap throws `ImageTooLargeError`, which `saveReceipt` catches to still save
  the receipt's extracted data (just without the photo) rather than losing everything,
  surfacing `receipts:scanErrors.imageTooLarge` to the user. `saveItemDetails` doesn't
  have this fallback since it's user-resized JPEG only (no PDFs), always comfortably
  under the cap. Images are fetched **on demand**, not eagerly: `ItemDetailModal` fetches
  its own image once on open (only one modal open at a time, cheap); the receipts list
  does **not** eagerly fetch every card's photo on render (that would mean pulling every
  receipt's base64 blob on every `/receipts` load) — instead each card gets a small 📷
  button that calls `getImageDataUrl` lazily on click, converts the result to a Blob URL,
  and opens it in a new tab.
  **Requires a one-time manual Console step, not doable from this codebase**: enable
  Firestore (Console → Build → Firestore Database → Create database, Native mode, any
  region — no Blaze plan needed) and set its security rules (separate from the Realtime
  Database's own rules) to allow the app's unauthenticated reads/writes, same open
  philosophy as `/groceries`/`/categories`:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /groceryImages/{id} { allow read, write: if true; }
      match /receiptImages/{id} { allow read, write: if true; }
    }
  }
  ```
  Until both steps are done, saves fail cleanly with `PERMISSION_DENIED` (confirmed via
  browser testing) rather than the confusing indefinite-hang/CORS-flavored failure the
  old Storage-based code produced against the nonexistent bucket.

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

## Auto-categorization for manually-added items

`GroceryItemModal.tsx`'s "add item" flow (the FAB on custom lists) has **no manual
category picker** — it's a single free-text field, and the typed text is sent through
n8n to be extracted/categorized by Gemini before being saved, mirroring exactly how
Siri's own voice flow works (same category list, same prompt logic, so a manually
typed "חלב" and a spoken "חלב" land in the same category). Separate n8n workflow,
"Categorize Grocery Item (Hebrew)" (webhook path `categorize-item`) — deliberately its
own workflow rather than reusing the Siri webhook, since Siri's webhook also does
Firebase dedup/insert/update directly (bypassing the web app entirely) and has no
concept of `list_name`; this one only extracts + categorizes and lets the web app
handle persistence, same "n8n extracts, app persists" split already used for receipt
scanning.

- `src/lib/firebase.ts`'s `categorizeItem(text)` posts to `/api/categorize-item` (a
  TanStack Start server route, same server-side-URL-hiding pattern as the receipt
  endpoints) and returns `{ item, category }[]` — free text can describe more than one
  item (e.g. "חלב ולחם"), so `GroceryItemModal` loops over every returned item and
  calls `onAdd` once per item.
- If Gemini finds nothing relevant to a shopping list (chit-chat, same filtering Siri
  applies) or the network call fails outright, `GroceryItemModal` falls back to adding
  the raw typed text as a single item under `OTHER_CATEGORY_NAME` — nothing the user
  types is ever silently dropped, matching the graceful-degradation pattern used
  elsewhere (receipt OCR failing still opens the review modal, just empty).
- Known gap this does **not** fix: same as Siri's own workflow, the categorization
  prompt's category list is hardcoded in the n8n workflow, not read live from
  `/categories` — see the existing "n8n still doesn't read /categories" known gap
  below, which now applies to two n8n workflows instead of one.

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

**Gemini quota fallback + graceful error surfacing** (v2.11.0–v2.12.0): a real production
incident — the app suddenly returned a generic `{"error":true,"message":"receipt scan
upstream failed"}` — was root-caused via `n8n_executions` (mode: error) to Google's free
Gemini tier quota (20 req/day, shared across every n8n workflow using this credential)
being exhausted. The underlying bug wasn't the quota itself, it was that "Analyze
Receipt"/"Analyze Receipt PDF" had no error handling at all: any Gemini failure killed
the whole execution *before* "Respond with Receipt" ran, so n8n fell back to an **empty
200 body**, which is what made the app's `response.json()` throw `Unexpected end of JSON
input` several layers away from the real cause. Fixed two ways, both in the n8n
workflow:
1. Both Gemini nodes now use `onError: "continueErrorOutput"` wired into "Parse
   Receipt", which detects the error shape and returns a real
   `{ error: true, message: 'quota_exceeded' | 'gemini_failed', detail }` payload.
2. A same-credential fallback model (`models/gemini-2.0-flash`) runs on that error
   output — Google's free-tier quota is tracked **per model** (confirmed via the 429
   error's `quotaDimensions.model` field), so this is a genuinely separate quota bucket
   on the same API key, not a new signup. Hit a real gotcha wiring this up:
   `continueErrorOutput`'s output item drops the original binary entirely (confirmed via
   execution trace — it's just `{ error: "<message>" }`), so two "Rebuild Image/PDF
   (Fallback)" Code nodes reconstruct the binary from the original webhook payload
   (`$('Receipt Webhook').first().json.body.image_base64`, via
   `this.helpers.prepareBinaryData`) before the fallback Gemini call — relying on
   passthrough silently fails with "no binary file 'data' found" instead.

On the app side, `src/components/ReceiptReviewModal.tsx` takes a `scanErrorMessage` prop
and shows it as an in-modal banner — this exists because the parent's own toast
(`scanError && !reviewData`) turns out to be permanently suppressed for every scan
failure, since `receipts.tsx` always sets both `scanError` and `reviewData` (the empty
fallback) in the same update, so `!reviewData` is never true when it'd matter. A
`quotaExceeded` i18n string (he/en) gives the quota case a specific, honest message
instead of the generic "couldn't read automatically" one.

Known gap, not fixed: the same missing-error-handling pattern (no `onError`, no
fallback model) likely still exists in "Receipt URL Parser (Hebrew)" and "Categorize
Grocery Item (Hebrew)" — only "Receipt Scanner (Hebrew)" was hardened, since that's the
one actually reported failing.

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

**Reconcile-after-save (stock + shopping list)**: right after `saveReceipt()`
succeeds — for a photo/PDF scan or a URL-sourced receipt, same for both — each saved
line item's name is matched (same normalized/trimmed/lowercased comparison used
everywhere else in the app) against current `/stock` items
(`findStockItemByName`, existing) and against unbought `/groceries` items
(`findUnboughtGroceryItemByName`, mirrors `findStockItemByName`'s shape).
`src/components/ReceiptReconcileModal.tsx` then opens next in the same per-receipt
queue slot the review modal just vacated, listing **every** line item (not just ones
that matched something — an earlier version of this feature silently dropped
unmatched items entirely, which is exactly what "some products are in the receipt
but not in the list" was reported against; fixed in v2.8.0) with independently
toggleable checkboxes: "add +N to stock" (only shown if a stock match exists) and a
shopping-list checkbox that's either "mark as purchased" (if an unbought match
exists — updates that record) or "add to shopping list as purchased" (no match —
creates a fresh `bought: true` entry via `addPurchasedGroceryItem`, category taken
from the stock match if there is one, else run through the same `categorizeItem()`
Gemini call the manual "add item" flow uses (falling back to `OTHER_CATEGORY_NAME`
only if that call throws or returns nothing) — receipt items don't carry a category
of their own, so this lookup is done once per item in `handleSaveReceipt` and stored
on each match as `suggestedCategory`. Every checkbox is checked by default but nothing is written
until the user hits confirm, same "review before persisting" principle as the
receipt review screen itself (see Session 4 reasoning above) and the existing
restock-on-checkout prompt. Skipping the modal falls straight through to
`advanceQueue()` exactly as before this feature existed — the multi-file upload queue
counter is unaffected. Same known name-matching limitation as everywhere else
("קוטג' 5%" vs "קוטג 5 אחוז" won't link up) — not solved differently here.

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

## In-app feedback → Trello module (`src/components/FeedbackModal.tsx`)

A "💬 שליחת משוב"/"Send feedback" item in the settings menu (`canEdit`-gated, same
menu as Categories/Share editing/Changelog) opens `FeedbackModal` — a single free-text
field (Hebrew or English) that turns a feature request / feedback into a structured
Trello card on the product board. Same "n8n extracts + acts, the app stays thin" split
already used for receipt scanning and item categorization.

- `submitFeedback()` in `src/lib/firebase.ts` auto-populates the metadata the ticket
  needs (name/email from the signed-in user, `submittedAt`, `language` from the active
  i18n language, `route` from `useRouterState`, `appVersion` from `package.json`) and
  POSTs to `/api/submit-feedback` (`src/routes/api/submit-feedback.tsx`) — a TanStack
  Start server route, same server-side-URL-hiding pattern as the receipt/categorize
  endpoints (the n8n webhook URL never reaches the browser). It returns `{ error }`
  rather than throwing so the modal can show a recoverable message; the modal guards
  against double-submit while a request is in flight.
- n8n workflow **"Feedback → Trello (Hebrew/English)"** (id `Dkug7Uj2Z7FTYQsL`, webhook
  path `feedback`): Webhook → Gemini (`models/gemini-2.5-flash`, `jsonOutput`) structures
  the request into a ticket (title/description/acceptance criteria/priority/labels/…),
  system prompt treats the user's text as **data, not instructions** (prompt-injection
  guard) and detects/matches the request language → "Build Card" Code node composes the
  Trello card name + markdown description (preserving the original request for
  traceability), with **graceful fallback**: if Gemini fails or returns junk it still
  creates a card from the raw request (labelled `needs-clarification`) rather than
  dropping the feedback → **Trello "create card"** into the **Customer Response** list
  (id `6a50cb0765f083fbb3ac5102`) on the Fridge app board (id `6a50ca96490e3f2e13fda0aa`)
  → responds. Both the Gemini and Trello nodes use `onError: continueErrorOutput`; the
  Trello error path responds `{ error: true, message: 'trello_failed' }` cleanly instead
  of the empty-200 failure mode.
- **Trello credential + activation (done, live as of 2026-07-10):** the workflow uses a
  `trelloApi` credential ("Trello account", a Trello API key + token) attached to the
  "Create Trello Card" node, and is **active**. Verified end-to-end (he + en test
  submissions each produced a correctly-structured card in Customer Response). If the
  workflow ever stops creating cards, first check that credential is still valid. Gotcha
  worth remembering: on the Trello node's card-create, the description is a **top-level
  `description` parameter, NOT `additionalFields.description`** — the first test run set
  it under `additionalFields` and the card came out with an empty body (title still
  worked), silently, no error.
- **Deliberately scoped out** (matching this project's lean ethos, noted as gaps):
  webhook rate-limiting, cross-retry dedup / correlation-ID, analytics events, and a
  manual-review queue — all in the Trello card spec but not built. Kept the cheap,
  high-value parts: client double-submit guard, prompt-injection-resistant prompt, and
  honest error surfacing.
- **Deliberately scoped out** (matching this project's lean ethos, noted as gaps):
  webhook rate-limiting, cross-retry dedup / correlation-ID, analytics events, and a
  manual-review queue — all in the Trello card spec but not built. Kept the cheap,
  high-value parts: client double-submit guard, prompt-injection-resistant prompt, and
  honest error surfacing.

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

**This is unchanged even after adding the view-gate in v2.19.0** — see Auth above.
The web app enforces both view and edit permission client-side (`canView`/`canEdit`
gates), not via these DB rules, specifically so n8n's unauthenticated writes don't
break. Anyone with the Firebase config (which is not secret — API keys in client SDKs
never are) could technically still read/write directly via REST, bypassing the app's
UI gate entirely — the v2.19.0 change stops a casually shared tablet URL from exposing
the list to anyone who opens it, not a determined technical attacker.

## Known gaps / next steps in progress

1. **n8n still doesn't read `/categories`.** The web app now does (see Categories
   module above) — this gap is narrower than it used to be, but n8n's Siri workflow
   still hardcodes its own copy in two places (the Gemini prompt and
   `VALID_CATEGORIES`), and the new "Categorize Grocery Item (Hebrew)" workflow (see
   Auto-categorization section above) hardcodes the same list a second time, since it
   deliberately mirrors Siri's prompt for consistency. Intended next step, unchanged:
   add a "Get Categories" HTTP GET node early in each flow, and rewrite the Gemini
   system message + category list to reference its output instead of hardcoded
   arrays. Until that's done, adding/renaming/deleting a category in the app has no
   effect on how either Siri or manually-typed items get classified.
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
7. **Gemini error handling/fallback only applied to one n8n workflow.** "Receipt
   Scanner (Hebrew)" now has `onError: continueErrorOutput` + a same-credential
   fallback model (see Receipt scanning module section above) — "Receipt URL Parser
   (Hebrew)" and "Categorize Grocery Item (Hebrew)" likely still die silently on any
   Gemini failure the same way Receipt Scanner used to, since they share the exact
   same missing-error-handling pattern and the same shared Gemini quota. Not hardened
   yet because they weren't the ones actually reported failing.
8. **Feedback → Trello workflow: Gemini has no fallback model.** The
   "Feedback → Trello (Hebrew/English)" workflow (id `Dkug7Uj2Z7FTYQsL`, see the In-app
   feedback module above) is live and verified end-to-end as of 2026-07-10 (Trello
   credential attached + activated). What's *not* hardened: its Gemini "Structure Ticket"
   node has only `retryOnFail`, no same-credential fallback model like Receipt Scanner's
   — so a sustained Gemini quota/outage still degrades it, though less badly than the
   others in gap #7 because "Build Card" falls back to a raw-request card (labelled
   `needs-clarification`) rather than dying. Adding a fallback model here is the same
   follow-up as gap #7.
9. **`GITHUB_RELEASES_TOKEN` not yet provisioned.** The in-app changelog viewer's new
   `/api/releases` server route (see the In-app changelog viewer section above) is
   written and tested, but needs a real fine-grained GitHub PAT (read-only
   Contents/Metadata scope on this repo) set as an env var — locally in `.env.local`
   and in Vercel's project settings — before it actually returns data instead of a
   `not_configured` 503. Not something this codebase can generate on its own, same
   category as the SMTP credentials gap that used to be here (now provisioned).
10. **`/whats_new` Firebase rule not applied, and no data published yet.** See the
    What's New feed section above — confirmed via a direct REST probe that both read
    and write are currently denied. Add the rule, then populate
    `{ version, updates: [...] }` (Console or REST `PUT`) as part of shipping the next
    notable release, alongside its version bump and GitHub Release.

## Frontend app (fridge-list-app/)

**TanStack Start** (React + TanStack Router, file-based routing, Vite/Nitro under the
hood), **TypeScript throughout** (`.tsx`/`.ts`, `strict: false` + `strictNullChecks:
true` — the latter is required by TanStack Router's own types, see `tsconfig.json`).
Still talks directly to Firebase from the browser exactly as before; TanStack Start's
SSR only renders the static shell (header/theme), since `/groceries`, `/stock`,
`/receipts`, `/categories`, `/admins` are realtime `onValue` push subscriptions, not
one-shot fetches, so they deliberately aren't wired through server loaders. Migrated
from a plain Vite SPA in v2.0.0, restructured + converted to TS in v2.2.0 — see the
[v2.0.0](https://github.com/MuliTu/fridge-list-app/releases/tag/v2.0.0) and
[v2.2.0](https://github.com/MuliTu/fridge-list-app/releases/tag/v2.2.0) GitHub Releases
for what changed structurally.

```
npm install
npm run dev          # http://localhost:5173
npm run build         # outputs dist/client + dist/server
npx tsc --noEmit      # type check
npm test              # Jest unit + integration tests
npm run test:e2e       # Playwright e2e (see Testing section below)
```

Folder structure:
- `src/routes/` — file-based route tree (must stay at exactly this path, TanStack
  Router convention). `__root.tsx` is the document shell (`<html lang="he" dir="rtl">`,
  fonts, title, `App.css`); `index.tsx` (`/`), `stock.tsx` (`/stock`), `receipts.tsx`
  (`/receipts`) are the three tabs; `api/scan-receipt.tsx` + `api/scan-receipt-url.tsx`
  + `api/categorize-item.tsx` + `api/client-log.tsx` are server routes
  (`server.handlers.POST`, Web-standard `Request`/`Response`) — TanStack Start's dev
  server serves these natively, no separate proxy plugin needed. `src/routeTree.gen.ts`
  is generated by the router's Vite plugin — never edit it by hand, and don't be
  alarmed by verbose `page reload src/routeTree.gen.ts` dev-server log lines; it's a
  known cosmetic watcher quirk in some environments, doesn't affect the app (confirmed
  via direct browser checks) or the production build.
- `src/components/` — shared UI: the modals (`ItemDetailModal`, `GroceryItemModal`,
  `StockItemModal`, `ReceiptReviewModal`, `ReceiptReconcileModal`, `CategoriesModal`,
  `AdminsModal`, `ChangelogModal`, `RestockPrompt`), `src/components/ui/` (shadcn
  primitives — `button`, `dialog`, `alert-dialog`, `input`, `label`, `select`,
  `textarea`, `checkbox`, `dropdown-menu`), and `Layout` (header, tabs-as-`<Link>`s,
  settings menu via shadcn `DropdownMenu`, mounts `GroceriesFeedProvider` +
  `DialogServiceProvider`).
- `src/hooks/` — `AuthContext` (`useAuth`, Google-popup sign-in), `GroceriesFeedContext`
  (`useGroceriesFeed`, the single shared `/groceries` subscription driving the new-item
  toast + status line visible across all three tabs), `DialogServiceContext`
  (`useDialogService` — themed `confirm`/`prompt`/`alert` replacing
  `window.confirm`/`prompt`/`alert`, see Design system section below), `useCategories`,
  `useCollapsedSections`.
- `src/lib/` — `firebase.ts` (all Firebase reads/writes), `formatDateTime.ts`,
  `categories.ts` (default categories + protected-"אחר" constant), `normalizeName.ts`
  (shared dedup/matching helper, extracted out of `firebase.ts`/`receipts.tsx` for
  unit-testability), `logger.ts` (see Logging section below).
- `src/types.ts` — shared interfaces (`GroceryItem`, `StockItem`, `Category`, `Receipt`,
  `ReceiptItem`, `AuthUser`) reused across lib/hooks/components/routes.
- `e2e/` — Playwright e2e specs (see Testing section below); test files elsewhere are
  colocated `*.test.ts`/`*.test.tsx` next to their source, not in a separate tree.
- `.github/workflows/` — CI (see Testing section below).

The custom/temporary list picker on `/` is a `?list=` search param
(`Route.useSearch()`/`Route.useNavigate()`) instead of local state, so a custom list is
a shareable/refreshable URL.

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

## Logging (`src/lib/logger.ts`, `/api/client-log`)

Server routes (`scan-receipt`, `scan-receipt-url`, `categorize-item`) log through
`logger` (a thin `consola` wrapper, three levels only — `success`/`warn`/`error`,
timestamped) — request received, upstream call attempted, upstream response/failure.
Any new server route should log through this, not `console.log`, to keep one
consistent, greppable format.

Client-side Firebase writes (every mutating function in `src/lib/firebase.ts` — add/
delete/edit grocery items, stock add/adjust/delete, receipt save/delete/reconcile,
category add/update/delete, admin invite/removal) log through a `logClientAction()`
helper that does two things: logs to the browser console immediately, **and**
`fetch`s the message to `/api/client-log` (`src/routes/api/client-log.tsx`), a small
server route that re-logs it through the same `logger` — so a client-side action
shows up in the `npm run dev` terminal too, not just the browser console (a browser
tab and the dev server are different processes; a plain `console.log` in a component
never reaches the terminal on its own). Forwarding is fire-and-forget — a logging
failure must never block the actual Firebase write.

## In-app changelog viewer (`src/components/ChangelogModal.tsx`)

A "📝 יומן שינויים"/"Changelog" item in the settings menu (`canEdit`-gated, same menu
as "Manage categories"/"Share editing") opens a modal that fetches and renders this
repo's [GitHub Releases](https://github.com/MuliTu/fridge-list-app/releases) **inside
the app**, for tracking — as of 2026-07-17 this replaced an earlier version that
imported a tracked `CHANGELOG.md` file directly via Vite's `?raw` suffix (that file no
longer exists; see the Versioning note at the top of this doc for why). `getReleases()`
in `src/lib/firebase.ts` calls a new same-origin server route, `src/routes/api/releases.tsx`
(same URL-hiding/auth pattern as the receipt-scan/categorize-item endpoints —
`verifyAuthToken`-gated, same graceful-degradation-on-missing-config style as
`send-invite-email.tsx`'s SMTP vars), which proxies GitHub's Releases API using a
server-side-only PAT (`GITHUB_RELEASES_TOKEN` env var — **not yet provisioned as of this
writing**, a manual step outside this codebase; until it's set, the modal shows a
translated "failed to load" message rather than crashing). Each release's `body` is
rendered with the same small hand-rolled markdown-to-HTML parser as before (headers,
`-` bullets with indented continuation lines, `**bold**`, `` `code` ``, `[text](url)`
links) rather than a markdown dependency — release notes only ever use that subset.
Left untranslated/English on purpose (unlike the rest of the app's UI): this is a
tracking utility for whoever's developing the app, not end-user-facing copy, and
translating years of technical release notes wasn't worth it for that audience.

## First-time onboarding (`src/components/OnboardingModal.tsx`, `src/hooks/useOnboarding.ts`)

A 7-step mock-data walkthrough (welcome → adding items → search → categories →
lists/sharing → stock → receipts) shown once per user, with a "🎓 Show tutorial"
sidebar item (ungated) to replay it anytime. As of 2026-07-17 the steps cover the
app's current feature set, not just the original 6 — the old "sharing" step (which
described the pre-multi-tenant "custom/temporary lists + invite people to the shared
list" model) was rewritten into a "lists" step describing the real multi-tenant
behavior (own list, invites, switching, bulk import with dedup), and two new steps
were added (search, and a quantity/unit mention folded into the addItems step).

**Dismissal is now a cross-device Firebase preference, not `localStorage`.** The
"don't show this again" checkbox on the last step writes
`onboardingDismissed: true` to `/users/{sanitizeEmailKey(email)}/config`
(`configRef`/`getOnboardingDismissed`/`setOnboardingDismissed` in `src/lib/firebase.ts`)
instead of a per-device `localStorage` key — dismissing the tutorial on one device now
dismisses it everywhere that user signs in. `useOnboarding(email)` needs no new
Firebase rule: `/users/{uid}/config` rides along under whatever rule already covers
the rest of `/users/{uid}` (confirmed via a direct REST `PUT`, unlike `/whats_new`,
which needed a brand-new rule since it's a fully global path outside `/users`).
`isOpen` starts `false` and only flips to `true` after the read resolves with no prior
dismissal, so a returning user never sees a flash of the tutorial before their real
preference loads; `replay()` can still force it open at any time regardless of that
read's timing.

**`config` is the general home for per-user settings.** In addition to
`onboardingDismissed`, `keepBoughtItemsInCategories` records whether checked items stay
in their original category (`true`) or move to the separate completed section (absent
or `false`, preserving the historical default). The dedicated `/settings` tab controls
this cross-device preference alongside language and stock-suggestion preferences; the
sidebar stays focused on list and administrative actions. A failed write rolls the UI
back to its prior value.

**Vercel packaging compatibility:** `firebase-admin` currently brings in
`jwks-rsa`, whose CommonJS entry point synchronously requires `jose`. Vercel's Node
launcher cannot bridge that require to the ESM-only `jose` v6 build, so `package.json`
pins only `jwks-rsa`'s nested `jose` dependency to the compatible v5 line. The app's
own direct `jose` v6 dependency remains unchanged. The generated serverless function
is named `api.func` rather than `index.func` so it cannot shadow the SPA's static
`index.html`; only `/api/*` routes invoke it.

## What's New feed (`/whats_new`, `src/components/WhatsNewModal.tsx`)

A separate, lighter-weight sibling to the Changelog viewer above — added 2026-07-17,
meant for regular end users rather than engineers. A "🆕 מה חדש"/"What's New" item in
the sidebar menu (ungated — visible to any signed-in user, not `canEdit`-only like most
of the settings section, since every signed-in user already has `canEdit === canView`
in the current multi-tenant list model anyway) opens `WhatsNewModal`, which subscribes
live (`useWhatsNew()` → `onValue(whatsNewRef, ...)`) to a single **global** Firebase
node — `/whats_new`, a sibling to `/users`, not owned by any particular list, since
it's app-wide release info. Shape (see `WhatsNew` in `src/types.ts`):

```
{ version: string, updates: string[] }
```

A single object, not a history — each new version's data overwrites the previous one
entirely (the exhaustive multi-version history lives in GitHub Releases instead, see
above). `updates` is plain, untranslated prose (same precedent as category/list names,
item notes — freeform dynamic content this app doesn't run through i18n), meant to be
short, plain-language bullets a non-technical household member can read, unlike the
Changelog's engineer-facing detail.

**Not yet populated, and no in-app write path exists.** Nothing in this codebase writes
to `/whats_new` — it's meant to be updated manually (Firebase Console, or a REST `PUT`)
as part of shipping a notable release, alongside the version bump and GitHub Release.
**The Firebase rule also isn't applied yet** (confirmed via a direct REST probe: both
read and write currently 401 `Permission denied`) — needs
`"whats_new": { ".read": true, ".write": true }` added in the Console, same open
philosophy as `/categories`, before this feature shows real data instead of the empty
state.

## i18n (Hebrew/English, RTL/LTR)

`react-i18next`, initialized in `src/i18n/config.ts`, namespaced JSON resources at
`src/i18n/locales/{he,en}/{common,shoppingList,stock,receipts,categories,admins}.json`.
Hebrew is the default/fallback language and always what SSR renders (see below for
why). A language-switcher button in the header (`src/components/Layout.tsx`,
`.lang-switch-btn`) calls `changeLanguage()` from `config.ts`, which both calls
`i18n.changeLanguage()` and persists the choice to `localStorage` (`appLanguage` key).
`src/hooks/useSyncHtmlLangDir.ts` keeps `<html lang>`/`<html dir>` in sync with the
active language (`rtl` for Hebrew, `ltr` otherwise) and applies any stored preference
on mount.

Persisted data values are never translated — e.g. `StockItemModal.tsx`'s unit presets
(`'יח''`, `'ק"ג'`, etc.) and the protected category name `"אחר"` are real strings
matched by equality against what's stored in Firebase; translating them in the UI
would silently break that matching. Only display-only UI copy went through i18n
extraction.

**Known SSR/hydration limitation, deliberately accepted rather than engineered
around:** `i18n.init()` always starts at `'he'` on both server and client (so the very
first client render matches the server-rendered HTML exactly), and only *after* mount
does a `useEffect` in `useSyncHtmlLangDir` switch to whatever language was previously
stored. This avoids the worse failure mode this session actually hit first — when SSR
and the client's *initial* render disagreed on language, React discarded the entire
server-rendered document and did a full client-side re-render instead of hydrating
(a real, visible flash/relayout, not just a console warning). With the current fix,
a returning English-preferring user still gets one harmless React
"text content did not match" warning for content inside the lazily-loaded route chunk
(`src/routes/index.tsx` specifically, e.g. the "Permanent list" button) — this is a
race between TanStack Router's per-route code-splitting hydrating slightly after the
root layout's language-switch effect runs. React auto-heals the text to the correct
value; it does not repeat the full-document-replace failure. A proper fix would read
the language preference from a cookie (available during SSR) instead of/alongside
`localStorage`, so the server could render the correct language from the first byte —
not done here since it requires threading request-scoped state through the root
route's SSR path, out of scope for this pass.

## Design system (shadcn/ui)

Conventions for using shadcn/ui and the chalkboard palette are now in
`.claude/skills/add-app-module` — see that skill instead of here.

As of v2.14.0, the native-HTML-to-shadcn conversion is done for everything that
actually looks/behaves native: `window.confirm`/`prompt`/`alert` → a promise-based
`useDialogService()` (`src/hooks/DialogServiceContext.tsx`, mounted once at the root)
backed by shadcn `AlertDialog`/`Dialog`; the raw checkbox in `ReceiptReconcileModal` →
shadcn `Checkbox`; the hand-rolled settings menu (`Layout.tsx`) → shadcn `DropdownMenu`.
**Deliberately left alone**, matching this project's own bespoke-app-chrome precedent:
FABs, list pills, tab links, the stock +/- stepper, icon-only action buttons (⚙️ ✎ 🗑
ℹ️ 📷) — these are plain `<button>`s with full custom theming, not raw/unstyled HTML,
and forcing them through shadcn was explicitly scoped out. Also left native, since
shadcn has no equivalent: `<input type="color">` (category picker), `<input
type="file">` (photo/receipt upload) — both are OS-native pickers.

## Testing (Jest unit/integration, Playwright e2e, GitHub Actions)

Added from scratch in v2.15.0 — see `.claude/skills/senior-qa-jest` for the judgment
behind these choices (what's worth testing here, mocking strategy, avoiding brittle
tests). Quick reference:

- **Unit + integration**: Jest + `ts-jest` (`jest.config.cjs`, `tsconfig.jest.json` —
  a separate CommonJS-output tsconfig, since the app itself is ESM/bundler-mode,
  which Jest can't run directly) + `@testing-library/react`. `npm test` /
  `npm run test:watch` / `npm run test:coverage`. Tests are colocated
  (`*.test.ts`/`*.test.tsx` next to the source file). Firebase and `react-i18next`
  are mocked at the module boundary — tests must **never** touch the real
  `n8n-vocal-2-db` Firebase project. `src/lib/normalizeName.ts` was extracted out of
  `firebase.ts`/`receipts.tsx` (previously duplicated verbatim in both) specifically
  to make it unit-testable in one place.
- **e2e**: Playwright (`playwright.config.ts`, `e2e/*.spec.ts`), `npm run test:e2e`.
  Scoped to **view-only flows only** (header/tabs render, tab navigation, sign-in
  button when logged out, language switch) — this app's edit actions need a real
  Google `signInWithPopup`, which isn't automated here; the local dev auth bypass
  (`.env.local`) is for interactive manual QA, not for baking into an automated
  suite that might run against a real deployed URL. Known gotcha if you add more
  e2e tests: this is an SSR (TanStack Start) app — clicking immediately after
  `page.goto()` can silently no-op before client hydration finishes; wait for
  `networkidle` first.
- **CI**: `.github/workflows/test.yml` runs on every push/PR (type-check + Jest +
  build). `.github/workflows/e2e-deploy-check.yml` triggers on GitHub's
  `deployment_status` event and runs the Playwright suite against the actual
  deployed URL — this project is confirmed connected to Vercel via its native
  GitHub integration (the git-branch-aliased domain
  `fridge-list-app-git-main-*.vercel.app` only exists for git-linked projects, not
  CLI-only deploys), so Vercel's GitHub App does fire `deployment_status` for both
  preview and production deploys.

## Session conventions

Versioning discipline, verification steps, n8n/Firebase access rules, cost-consciousness,
i18n discipline, graceful degradation, and test-data hygiene are now codified as skills —
see `.claude/skills/release-bump`, `.claude/skills/firebase-data-model`, and
`.claude/skills/n8n-groceries-workflow`. Read those before making changes instead of
looking for this info here.

Senior-level judgment for frontend code, backend/server-route + n8n code, and Jest
testing is codified in `.claude/skills/senior-frontend`, `.claude/skills/senior-backend`,
and `.claude/skills/senior-qa-jest` respectively — consult these for *judgment calls*
(is this the right abstraction, is this error handling complete, is this worth testing),
as distinct from the other skills above which are more reference/procedure-oriented.

**Git workflow: branch + PR, not direct pushes to `main`** (as of 2026-07-07). Once a
change is ready to commit, create a feature branch (`git checkout -b <descriptive-name>`),
commit there, push the branch, and open a pull request (`gh pr create`) instead of
committing straight to `main`. This repo is connected to Vercel's native GitHub
integration (confirmed — the git-branch-aliased domain `fridge-list-app-git-main-*
.vercel.app` only exists for git-linked projects), so a PR branch also gets its own
preview deployment automatically, which is a real benefit of this flow, not just
process for its own sake. Still only commit when the user has actually asked for
it — this changes *where* the commit goes (a branch, then a PR), not whether to commit
unprompted; see the general git-safety rules for that. Only exception worth checking
with the user about case-by-case: a genuinely urgent production-down fix, where going
straight to `main` might be the right call — don't assume that exception applies
without asking.

**Don't merge your own PRs.** Confirmed directly: Claude Code's own auto-mode
classifier blocks `gh pr merge` on a PR Claude authored, specifically because
merging without any human review defeats the point of this workflow. Open the PR and
stop there — ask the user to review and merge (or explicitly say they want to waive
review for that specific PR).
