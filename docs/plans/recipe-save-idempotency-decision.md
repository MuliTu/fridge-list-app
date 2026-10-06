# Decision checkpoint: explicit recipe saves

Status: approved by the owner in the main conversation (explicit “כן” to both decisions), implemented locally. No recipe delete path is introduced.
Related: [tasks](../specs/tasks-flagship-readiness.md#fr-009-make-explicit-recipe-save-idempotent), [spec](../specs/spec-flagship-readiness.md).

## Recommended first implementation

Keep one atomic record under the existing `users/{listId}/recipes/{key}` path.
Derive the key from a SHA-256 digest of authenticated UID and the client operation
UUID (the list path provides household isolation). Store the recipe and a hash of
its validated payload in that same record. A Firebase transaction creates the
record only if absent. Exact replays return the original key without overwriting
later values; a different payload using the same operation returns HTTP 409.
Recheck current write membership before every save or replay. Bind ownership to UID,
not email. Server timestamps are excluded from the intent hash.

The browser keeps the operation ID across uncertain network failures and reloads
until a success response. Storage must be scoped to UID, list and selected recipe;
sign-out must not replay another user's pending operation. Never auto-save a draft.

The idempotency marker lasts as long as the saved recipe, with no timer-based
expiry and no separate cleanup service. Current recipe save has no delete command.
If deletion is introduced, design a tombstone/operation receipt first so retrying a
deleted operation does not recreate it. The current grocery adapter does not yet
supply this durable deletion guarantee; do not copy that limitation into a future
recipe delete implementation unnoticed.

Tradeoff: minimal schema addition and atomicity at a single recipe node, with no
whole-household transaction or cleanup job. Pending operation metadata is local to
the browser, and stored record metadata adds a small amount of space per recipe.
Migration is additive: existing recipe keys remain valid. UI selectors must ignore
internal metadata, and client rules remain read-only for recipes.

## Alternative requiring more machinery

Maintain a separate durable operation ledger, including deletion tombstones and a
retention/expiry policy. This supports replay guarantees after recipe deletion but
requires atomic cross-record coordination, cleanup policy and more failure cases.
It is not needed for the initial explicit-save-only milestone unless the owner
wants deletion in that milestone.

## Review question

Use the recommended single-record design, retaining replay protection for the life
of the recipe, and keep recipe deletion outside the first milestone?

## Required proof before completion

Concurrent identical saves create one record; conflicting payload is rejected;
write succeeds but response is lost and retry returns the existing record; reload
keeps the operation; revoked membership cannot replay; distinct user/list scope
cannot collide; unsupported deletion has no UI/API action. No production migration
or deployment is included in this approval.
