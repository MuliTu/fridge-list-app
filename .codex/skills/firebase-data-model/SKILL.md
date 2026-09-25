---
name: "firebase-data-model"
description: "Reference the Firebase Realtime Database and Firestore schema, security rules, and read/write conventions used by fridge-list-app before adding or changing any data access code. Use when touching /groceries, /stock, /receipts, /categories, /admins, or the Firestore image collections."
---

fridge-list-app talks directly to Firebase from the browser (`src/lib/firebase.ts`), no backend API for data reads/writes. Get the schema right before writing code — see `CLAUDE.md` for full narrative detail; this is the quick-reference version.

## Realtime Database paths

- `/groceries/{pushId}` — `{ item, category, bought, added_at, raw_text, note, image_url, modified_at, modified_by, list_name, created_by }`. `list_name` absent/null = permanent list; any other string = a custom/temporary list (tag-based, no separate collection).
- `/categories/{key}` — `{ name, color, icon, protected }`. Live source of truth for the web app via `src/hooks/useCategories.ts`. `"אחר"` is `protected: true`, never rename/delete it in UI logic — it's the hardcoded fallback (`OTHER_CATEGORY_NAME` in `src/lib/categories.ts`).
- `/stock/{pushId}` — `{ name, category, quantity, unit, low_threshold, updated_at, updated_by }`. Only the web app writes here, n8n never touches it.
- `/receipts/{pushId}` — `{ image_url | null, source_url | null (exactly one set), store_name, items: [{name, price, quantity}], total, scanned_at, scanned_by }`.
- `/admins/{key}` — string email. Additional editors on top of the hardcoded `ADMIN_EMAILS` array in `src/lib/firebase.ts`.

## Firestore (images only, not Realtime DB)

- `groceryImages/{grocery item key}` and `receiptImages/{receipt key}` — one doc per image, base64 string, id always matches the owning RTDB record's key. Used instead of Firebase Storage because Storage requires the paid Blaze plan and this project stays on free Spark.
- `MAX_INLINE_IMAGE_BYTES` = 700KB raw (Firestore's 1MiB doc cap, base64 inflates ~4/3). Over the cap throws `ImageTooLargeError` — callers must catch this and save the record without the photo rather than losing the whole write.
- Images are fetched **on demand** (lazy, on click/open), never eagerly on list render.

## Current security rules

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

**`/stock` and `/receipts` rules are applied** (confirmed directly — real stock/receipt
reads and writes through the live UI succeed, no permission errors).

**`/admins` has NO rule applied at all — confirmed empirically via a direct
unauthenticated `GET .../admins.json`, which returns `{"error":"Permission denied"}`**
while the same request against `/groceries`, `/stock`, and `/categories` returns real
data (or `null` for empty, never a permission error). This means `/admins` is still
inheriting the root `.read: false, .write: false` deny-all default — not even a signed-in
admin can read or write it, which is the root cause of the "permission denied when
inviting" bug (reported 2026-07-08). The earlier note in this file claiming `/admins`
"is now applied" was wrong — it was inferred from "editing works end-to-end" elsewhere
in the app, not verified for this specific path. **You cannot fix this from the
codebase** (no admin/service-account credentials) — hand the user this exact rule to
paste into Console → Realtime Database → Rules, then re-verify with the same
unauthenticated `GET .../admins.json` check (should return real data or `null`, never
a permission error, once applied):

```json
"admins": { ".read": true, ".write": "auth != null" }
```

`auth != null` (not fully open) is deliberate here, unlike the other paths — `/admins`
controls who can edit everything else, so requiring *some* signed-in Google account
(even though it doesn't fully close the privilege-escalation gap — any Google account
holder could still add themselves) is strictly better than wide-open write.

**You cannot apply Console-level rule changes from this codebase** — no admin/service-account credentials, no Firebase CLI. Hand the user the exact rule snippet and ask them to apply it, then verify via a direct REST query once they confirm.

## Conventions to follow in new code

- Stamp `updated_at`/`updated_by` (or `modified_at`/`modified_by`) on every write that changes a record, same pattern already used everywhere.
- Name-matching across features (`findStockItemByName`, dedup, restock-on-checkout) is exact, trimmed + lowercased — no fuzzy matching. Don't silently "improve" this in one place without checking the other call sites; it's an accepted, consistent limitation, not a bug to fix in isolation.
- Never make a destructive multi-path bulk operation (like deleting a custom list) without a confirm dialog stating what will be removed.
- Any new feature that would need Firebase Storage or another paid tier — flag it explicitly and look for a Spark-tier alternative first (this project's owner has explicitly said no paid Firebase tiers).

## Before calling a Firebase-touching change done

Query the real data directly (REST or a disposable n8n debug workflow) to confirm the write actually happened in the expected shape — don't just trust that the code looks correct. Clean up any test writes immediately after verifying.
