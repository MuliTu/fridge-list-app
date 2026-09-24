# Firebase to RDS Discovery Findings

This appendix consolidates the read-only async discovery work for `RDS-002`, `RDS-003`, `RDS-004`, `RDS-005`, and the draft backup notes for `RDS-040`.

No production data was accessed. No application runtime code was changed.

## RDS-002: Firebase Browser Read/Write Inventory

| Firebase path / concept | Current code | Operation | Known callers | Proposed replacement | Risk |
| --- | --- | --- | --- | --- | --- |
| `users/{email}/name` | `userNameRef`, `ensureOwnList`, `renameOwnList` in `src/lib/firebase.ts:274`, `src/lib/firebase.ts:350`, `src/lib/firebase.ts:410` | read/write/subscribe | `src/hooks/ListContext.tsx`, `src/components/Layout.tsx` | `GET/PATCH /api/lists/:listId` backed by `HouseholdList` | Current list ID is email-derived; RDS needs stable canonical list IDs. |
| `users/{email}/memberOf` | `memberOfRef`, `approvePendingInvites` in `src/lib/firebase.ts:275`, `src/lib/firebase.ts:368` | read/write/subscribe | `src/hooks/ListContext.tsx` | `GET /api/me/lists` backed by `HouseholdMember` and `HouseholdInvite` | Pending versus approved semantics need a product decision. |
| `users/{owner}/invites` | `invitesRef`, `inviteToList`, `removeListMember` in `src/lib/firebase.ts:276`, `src/lib/firebase.ts:387`, `src/lib/firebase.ts:400` | read/write/subscribe | `src/components/ListMembersModal.tsx` | `GET/POST/DELETE /api/lists/:listId/members` | Mirror writes must become transactions; owner-only authorization is critical. |
| `users/{email}/config` | `configRef`, preference helpers in `src/lib/firebase.ts:282`, `src/lib/firebase.ts:284`, `src/lib/firebase.ts:291` | read/write | `src/hooks/useOnboarding.ts`, `src/hooks/BoughtItemsPreferenceContext.tsx` | `GET/PATCH /api/me/preferences` or list config endpoint | Small but real user data; must migrate before Firebase DB removal. |
| `whats_new` | `whatsNewRef` in `src/lib/firebase.ts:300` | subscribe | `src/hooks/useWhatsNew.ts` | `GET /api/whats-new` backed by static config or `WhatsNew` table | Low risk; no realtime needed in phase 1. |
| `feedbacks` | `feedbacksRef`, `createFeedbackRecord`, `updateFeedbackRecord` in `src/lib/firebase.ts:306`, `src/lib/firebase.ts:311`, `src/lib/firebase.ts:340` | write/update | `src/hooks/useFeedbackToast.ts`, `src/routes/api/retry-feedback.tsx` | `feedback_records` table and server-owned feedback API/retry worker | Browser submit and retry job must migrate together. |
| `users/{listId}/groceries` | `groceriesRef` and grocery commands in `src/lib/firebase.ts:424`, `src/lib/firebase.ts:474`, `src/lib/firebase.ts:611` | subscribe/read/write/delete | `src/hooks/GroceriesFeedContext.tsx`, `src/routes/index.tsx` | Existing write APIs plus `GET /api/lists/:listId/groceries` | Realtime read replacement is the main gap. |
| `users/{listId}/purchaseHistory` | `purchaseHistoryRef`, `recordPurchaseEvent` in `src/lib/firebase.ts:428`, `src/lib/firebase.ts:437` | write/subscribe | `src/hooks/usePurchaseInsights.ts` | `purchase_events` table, server append on purchase | Current write is fire-and-forget; decide whether to preserve non-blocking behavior. |
| `users/{listId}/stock` | `stockRef`, stock commands in `src/lib/firebase.ts:425`, `src/lib/firebase.ts:557` | subscribe/read/write/delete | `src/routes/stock.tsx` | `GET/POST/PATCH/DELETE /api/lists/:listId/stock` | Receipt reconciliation also writes stock; use transactions. |
| `users/{listId}/categories` | `categoriesRef`, category helpers in `src/lib/firebase.ts:427`, `src/lib/firebase.ts:836` | subscribe/read/write/delete | `src/hooks/useCategories.ts`, `src/components/CategoriesModal.tsx` | `GET/POST/PATCH/DELETE /api/lists/:listId/categories` | Default seeding must become idempotent server behavior. |
| `users/{listId}/receipts` | `receiptsRef`, receipt helpers in `src/lib/firebase.ts:426`, `src/lib/firebase.ts:776` | subscribe/read/write/delete | `src/routes/receipts.tsx` | `receipts` and `receipt_line_items` tables plus existing receipt API | Reads still use Firebase even where writes are partly server-backed. |
| Receipt reconciliation | `applyReceiptReconciliation` in `src/lib/firebase.ts:660` | multi-write | `src/routes/receipts.tsx` | `POST /api/lists/:listId/receipt-reconciliation` inside one transaction | Highest consistency risk; current multi-write can partially succeed. |
| Stock/grocery lookup helpers | `findStockItemByName`, `getAllStockItems`, `getAllGroceryItems` in `src/lib/firebase.ts:742`, `src/lib/firebase.ts:764`, `src/lib/firebase.ts:770` | read | `src/routes/index.tsx`, `src/routes/receipts.tsx` | Query endpoints or server-side reconciliation service | Preserve `normalizeName` behavior. |

Deferred storage note: grocery and receipt images are stored in Firestore through `src/lib/firebase.ts:137` and receipt image infrastructure. This is not Realtime Database and should remain a separate storage migration.

## RDS-003: Realtime Dependency Inventory

| Component / hook / route | Firebase ref/path | Current behavior | Phase 1 replacement | Risk |
| --- | --- | --- | --- | --- |
| `GroceriesFeedProvider` | `listApi.groceriesRef` -> `users/{ownerKey}/groceries` | Live groceries, loading state, last-updated text, new-item toast across tabs | `GET /api/lists/:listId/groceries` with cache invalidation, refetch-on-focus, and short polling; add SSE later only if needed | Stale cross-device edits; toast precision loss without push |
| `ListProvider` own list name | `userNameRef(email)` -> `users/{meKey}/name` | App boot and own-list provisioning | `GET /api/me/lists` that ensures/provisions own list server-side | Boot-critical; preserve loading gates |
| `ListProvider` membership discovery | `memberOfRef(email)` -> `users/{meKey}/memberOf` | Shared list discovery and active household switching | `GET /api/me/lists` joined from RDS memberships/invites | Invite visibility may need refetch after actions |
| `ListProvider` owner names | `userNameRef(ownerKey)` -> `users/{ownerKey}/name` | Resolves display names for shared lists | Return display name in `GET /api/me/lists` | Sanitized owner key may not map back to raw email |
| `useCategories` | `listApi.categoriesRef` -> `users/{ownerKey}/categories` | Live category list and grouping | `GET /api/lists/:listId/categories`; invalidate after writes | Stale categories can misgroup items |
| `/stock` route | `listApi.stockRef` -> `users/{ownerKey}/stock` | Live stock board and quantity updates | `GET /api/lists/:listId/stock`; invalidate after writes/reconciliation | Quantity conflicts need transaction-aware writes |
| `/receipts` route | `listApi.receiptsRef` -> `users/{ownerKey}/receipts` | Live receipts, sorting, price history, image buttons | `GET /api/lists/:listId/receipts`; invalidate after save/delete | Large histories may need server aggregation later |
| `usePurchaseInsights` | `listApi.purchaseHistoryRef` -> `users/{ownerKey}/purchaseHistory` | Purchase insights and habit-change inputs | Server-computed insights or `GET /purchase-history`; poll only while modal open | Preserve append-only semantics |
| `useWhatsNew` | `whatsNewRef` -> `whats_new` | App update modal content | `GET /api/whats-new`; cache aggressively | Low risk |
| `ListMembersModal` | `invitesRef(activeList.owner)` -> `users/{ownerKey}/invites` | Owner sees invited members and pending status | `GET /api/lists/:listId/members`; invalidate after invite/remove; poll while modal open | Owner-only auth and pending approval visibility |

Phase 1 recommendation: authenticated HTTP read endpoints with cache invalidation and selective polling. Treat groceries, list discovery, categories, stock, and receipts as critical. Treat purchase insights and members modal as on-open or lightly polled. Treat whats-new as non-realtime.

## RDS-004: Authorization Mapping

Core rule: RDS must enforce authorization before Prisma queries or mutations.

Production baseline:

- Authenticated, non-anonymous users only.
- Owners can access their own list.
- Approved members can read/write list-scoped app data where current server APIs allow writes.
- Pending members should not receive list data unless product explicitly changes current production Firebase rule behavior.
- Owner-only operations stay owner-only.
- n8n machine writes stay limited by secret, scope, and allowed list.

Important mismatch:

- `database.rules.json` grants list data access only to owner or `members/{uid}/status === approved`.
- `src/hooks/ListContext.tsx` comments suggest pending membership may still grant access.
- Safe migration baseline: follow production rules and require approved members for list data.

Required authorization API shape:

```ts
assertListReadable(principal, listId)
assertListWritable(principal, listId)
assertListOwner(principal, listId)
assertOwnIdentity(principal, uid)
```

Current gap:

- `src/modules/groceries/application/listAuthorizationRepository.ts` only exposes broad `assertAccessible`.
- `src/modules/composition.server.ts` currently wires fail-closed authorization placeholders for groceries and receipts.

Required tests:

- owner can access own list
- approved member can access list
- pending invite/member cannot access list data unless product decision changes
- missing membership returns forbidden
- member cannot read owner-only config/invites
- owner can rename list
- member cannot rename list
- authenticated user can read `WhatsNew`
- unauthenticated/anonymous principal is rejected
- n8n can write only configured allowed list and only grocery scope
- authorization failure happens before Prisma mutation

Authentication gap:

- Firebase rules reject anonymous providers.
- Current server principal exposes UID/email but not sign-in provider.
- Migration must either expose `signInProvider` from token verification or document that anonymous auth is disabled.

## RDS-005: Schema Gap Analysis

| Firebase shape | Prisma model | Coverage | Notes |
| --- | --- | --- | --- |
| `/users/{listId}` list root | `HouseholdList` | Partial | Schema expects `id`, `ownerUid`, `normalizedOwnerEmail`, `name`; older Firebase roots may only have `name`. |
| `/users/{listId}/config` | `UserConfig` | Good | `keepBoughtItemsInCategories` and `onboardingDismissed` map cleanly. |
| legacy `/invites`, `/memberOf` | `HouseholdInvite`, `HouseholdMember` | Partial | Firebase mirrors sanitized email keys/status strings; schema uses UID members and invited email. |
| `/groceries` | `GroceryItem` | Good | Most fields covered. |
| `/categories` | `Category` | Good | `order` nullable in Prisma while app type expects number. |
| `/stock` | `StockItem` | Good | Needs snake-to-camel transform. |
| `/purchaseHistory` | `PurchaseEvent` | Good | Preserve append-only behavior. |
| `/receipts` embedded `items[]` | `Receipt` + `ReceiptLineItem` | Needs transform | Preserve item array order using `position`; generate stable line item IDs. |
| `/whats_new` | `WhatsNew` | Good | Firebase string-array updates can map to JSON. |
| `/feedbacks` | `FeedbackRecord` | Partial | Firebase nested `error` and `ticket` flatten into Prisma fields. |
| Firestore `receiptImages` / `groceryImages` | none | Deferred | Keep Firestore temporarily or migrate to S3 later. |

Field transform notes:

- `added_at`, `modified_at`, `created_by`, `list_name` -> `addedAt`, `modifiedAt`, `createdBy`, `listName`
- `low_threshold`, `updated_at`, `updated_by` -> `lowThreshold`, `updatedAt`, `updatedBy`
- `store_name`, `source_url`, `scanned_at`, `scanned_by` -> `storeName`, `sourceUrl`, `scannedAt`, `scannedBy`
- `total` and receipt item `price` must use decimal-safe import.
- Firebase push IDs should be preserved as RDS IDs during backfill where possible.
- Prisma `@updatedAt` fields can overwrite migrated historical timestamps on future writes; import scripts and verification should account for this.

Open schema decisions:

- Source of truth for `HouseholdList.ownerUid` and `normalizedOwnerEmail` when older Firebase roots do not include them.
- Source of truth for `IdentityBinding` from email-keyed legacy data.
- Whether feedback production rules need extra verification before migration, because `feedbacks` is less explicitly covered in current rules.

## RDS-040 Draft Backup / Export Policy

Before any production cutover:

- Export full Firebase Realtime Database JSON for `/users`, `/whats_new`, `/feedbacks`, and `/identityBindings` if present.
- Export Firestore image collections separately: at least `receiptImages` and `groceryImages`.
- Store raw exports in encrypted, versioned, private S3.
- Suggested prefix:

```text
s3://<private-backup-bucket>/firebase-rtdb/YYYY-MM-DD/raw/full-export.json
s3://<private-backup-bucket>/firebase-firestore/YYYY-MM-DD/raw/
s3://<private-backup-bucket>/firebase-rtdb/YYYY-MM-DD/normalized/
s3://<private-backup-bucket>/firebase-rtdb/YYYY-MM-DD/verification/
```

Store metadata:

- Firebase project ID
- database URL
- export timestamp
- git branch
- commit SHA
- operator
- checksums
- object counts and row counts

Rules:

- Do not transform raw exports in place.
- Import into staging RDS first.
- Run verification counts before production import.
- After production import, take a manual RDS snapshot.
- Keep Firebase untouched or read-only through the rollback window.
