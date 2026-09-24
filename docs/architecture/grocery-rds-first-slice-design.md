# Grocery RDS First Slice Design

This design prepares `RDS-030` through `RDS-034`. It should start only after the foundation gates are complete:

- `GATE-1`
- `GATE-2`
- `GATE-3`
- `GATE-4`

## Objective

Move the grocery workflow to an RDS-backed path in staging while preserving the Firebase-backed production path until cutover.

The grocery slice is the first vertical proof because it already has:

- application service: `src/modules/groceries/application/groceryCommands.service.ts`
- write repository port: `src/modules/groceries/application/groceryWriteRepository.ts`
- server HTTP write handlers: `src/modules/groceries/infrastructure/groceryHttp.server.ts`
- API routes: `src/routes/api/lists/$listId/groceries*.tsx`
- client API helper: `src/client/api/groceries.ts`

## Scope

Included:

- RDS-backed grocery write repository
- grocery read repository/service
- authenticated grocery read API
- RDS path for add/update/purchased/delete/details
- phase 1 replacement for grocery `onValue`
- tests for auth, persistence, HTTP, client API, and UI refresh behavior

Deferred:

- stock migration
- categories migration
- receipt reconciliation transaction
- image storage
- full list/member API migration
- production cutover

## Current Write Contract

Current port:

```ts
insert(listId, record): Promise<string>
insertIdempotent(listId, idempotencyKey, record): Promise<string>
reactivate(listId, itemKey, record): Promise<void>
update(listId, itemKey, patch): Promise<void>
delete(listId, itemKey): Promise<void>
```

Current record fields are Firebase-shaped:

```text
added_at
raw_text
created_by
list_name
modified_at
modified_by
```

RDS repository should translate these to Prisma fields:

```text
addedAt
rawText
createdBy
listName
modifiedAt
modifiedBy
```

## Proposed Files

```text
src/modules/groceries/infrastructure/prismaGroceryRepository.server.ts
src/modules/groceries/infrastructure/prismaGroceryRepository.server.test.ts
src/modules/groceries/application/groceryReadRepository.ts
src/modules/groceries/application/getGroceries.service.ts
src/modules/groceries/application/getGroceries.service.test.ts
src/modules/groceries/infrastructure/groceryReadHttp.server.ts
src/modules/groceries/infrastructure/groceryReadHttp.server.test.ts
```

Potential route update:

```text
src/routes/api/lists/$listId/groceries.tsx
```

It currently supports `POST`; add `GET` only after auth/read service exists.

## Repository Behavior

### Insert

- generate ID with `crypto.randomUUID()` for new RDS-only items
- preserve imported Firebase IDs for backfilled rows
- insert into `GroceryItem`
- return ID as `key` for client compatibility

### Idempotent Insert

Current Firebase idempotent insert derives an integration key from an idempotency key. RDS options:

- preserve current deterministic ID format for n8n integration records
- use `upsert` on `id`
- return existing ID on conflict

Recommended:

```text
id = integration_<sha256(idempotencyKey).slice(0, 40)>
```

This matches the existing Firebase adapter behavior and simplifies verification.

### Reactivate

Set:

- `bought = false`
- `addedAt = record.added_at`
- maybe clear/leave `modifiedAt` according to existing behavior

### Update

Translate only supplied fields.

Important:

- `note` is supported by patch but not included in `NewGroceryRecord`
- do not wipe fields omitted from the patch
- preserve null semantics for `quantity`, `unit`, `note`, and `listName`

### Delete

Current Firebase delete removes the row. RDS can hard delete for compatibility.

Future soft delete is out of scope unless product asks.

## Read API Shape

Endpoint:

```http
GET /api/lists/:listId/groceries
```

Response:

```json
{
  "items": [
    {
      "key": "string",
      "item": "Milk",
      "category": "Dairy",
      "bought": false,
      "added_at": "2026-09-23T00:00:00.000Z",
      "raw_text": "נוסף ידנית",
      "note": null,
      "image_url": null,
      "image_ref": null,
      "modified_at": null,
      "modified_by": null,
      "list_name": null,
      "created_by": "user@example.com",
      "quantity": null,
      "unit": null
    }
  ]
}
```

Use Firebase-shaped response fields initially to minimize UI churn.

## Client Refresh Strategy

Phase 1:

- use authenticated HTTP read
- refetch after add/update/purchased/delete
- refetch when active list changes
- refetch on focus
- short polling for active grocery screen if needed

Do not require SSE/WebSockets for first slice.

Preserve:

- loading state
- last updated text
- new item toast where possible

Acceptable phase 1 behavior:

- cross-device updates appear on polling/refocus rather than instantly
- local writes refresh immediately after mutation

## Feature Flag Strategy

Use an explicit runtime switch for staging:

```text
RDS_GROCERY_READS_ENABLED
RDS_GROCERY_WRITES_ENABLED
```

or one combined switch:

```text
RDS_GROCERY_ENABLED
```

Production default must be false until cutover.

Do not infer RDS mode merely from `DATABASE_URL` being present.

## Tests

Repository tests:

- insert maps Firebase-shaped record to Prisma fields
- insert idempotent returns same row for same key
- reactivate updates bought/addedAt
- update maps patch fields and preserves omitted fields
- delete removes row
- list-scoped operations cannot affect another list

Application tests:

- add validates input and authorizes before insert
- update validates input and authorizes before update
- setPurchased validates boolean and authorizes
- delete authorizes before delete

HTTP tests:

- `GET` requires auth
- `GET` denies unauthorized list
- `GET` returns Firebase-compatible field names
- `POST/PATCH/PUT/DELETE` continue mapping errors safely

Client tests:

- grocery API client supports `get/list`
- mutation errors are typed
- missing/expired token produces safe error

UI tests:

- initial RDS read renders groceries
- mutation triggers refresh
- active list switch clears previous entries while loading
- stale polling failure shows recoverable status

## Rollback

Rollback is config-only before cutover:

- set grocery RDS flag false
- server composition continues using Firebase adapter
- client read path falls back to Firebase `onValue`

Do not remove Firebase grocery code until after full production rollback window.

## Exit Criteria

- Grocery workflow runs on RDS in staging.
- Production remains Firebase-backed by default.
- Unauthorized access is denied before DB mutation.
- Tests pass for repository, service, HTTP, client API, and relevant UI behavior.
- Rollback flag/path is documented and tested.
