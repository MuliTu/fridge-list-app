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

`/stock` and `/receipts` need the same open rule added (not yet applied as of the last CLAUDE.md update — check the live Console state before assuming). `/admins` needs a **tighter** rule than the others since it controls who can edit everything: recommended `"admins": { ".read": true, ".write": "auth != null" }`, not fully open.

**You cannot apply Console-level rule changes from this codebase** — no admin/service-account credentials, no Firebase CLI. Hand the user the exact rule snippet and ask them to apply it, then verify via a direct REST query once they confirm.

## Conventions to follow in new code

- Stamp `updated_at`/`updated_by` (or `modified_at`/`modified_by`) on every write that changes a record, same pattern already used everywhere.
- Name-matching across features (`findStockItemByName`, dedup, restock-on-checkout) is exact, trimmed + lowercased — no fuzzy matching. Don't silently "improve" this in one place without checking the other call sites; it's an accepted, consistent limitation, not a bug to fix in isolation.
- Never make a destructive multi-path bulk operation (like deleting a custom list) without a confirm dialog stating what will be removed.
- Any new feature that would need Firebase Storage or another paid tier — flag it explicitly and look for a Spark-tier alternative first (this project's owner has explicitly said no paid Firebase tiers).

## Before calling a Firebase-touching change done

Query the real data directly (REST or a disposable n8n debug workflow) to confirm the write actually happened in the expected shape — don't just trust that the code looks correct. Clean up any test writes immediately after verifying.
