# Realtime Database rules cutover notes

`database.rules.json` is a fail-closed target ruleset for the server-owned-write
cutover. It is version controlled but must not be deployed until the prerequisites
below are complete.

## Required server-owned metadata

For each legacy household stored at `/users/{listId}`, a privileged migration must
populate:

```text
/users/{listId}/ownerUid                         = "firebase-auth-uid"
/users/{listId}/normalizedOwnerEmail             = "verified@example.com"
/users/{listId}/members/{memberUid}/status        = "approved"
/users/{listId}/members/{memberUid}/role          = "editor" | "viewer"
/identityBindings/{uid}/ownListId                 = "legacy-list-id"
/identityBindings/{uid}/accessibleLists/{listId}  = true
```

Only `ownerUid` and an approved UID membership grant household reads. The normalized
email is migration/audit metadata and is deliberately never an authorization
predicate. Anonymous Firebase Auth sessions are denied.

The current application does **not** write these UID bindings. Its list keys and
mirrored `invites`/`memberOf` records are derived from sanitized email addresses,
which can collide and cannot be safely reconstructed from `auth.uid` in RTDB Rules.
Consequently, this ruleset denies existing household reads until the binding audit
and backfill are complete. This is intentional; do not weaken the rules with an
email-to-key comparison.

## Browser access after cutover

- Owners and approved UID members may read `name`, `groceries`, `categories`,
  `stock`, and `receipts` for their list.
- Owners may read private list metadata and update only `name` and `config`.
- Membership, ownership, invitations, and identity bindings are server-owned.
- Browser writes to `groceries`, `categories`, `stock`, and `receipts` are denied.
  Firebase Admin SDK repositories bypass Rules, so application-service
  authorization remains mandatory.
- Authenticated non-anonymous users may read `whats_new`; nobody may write it from
  the browser.
- Authenticated non-anonymous users may create and update only their own
  `/feedbacks/{id}` tracking records. Records are intentionally not browser-readable;
  the retry job and maintainer workflows use privileged server access.

Because RTDB read rules are not filters, no `.read` is granted at `/users` or at a
whole `/users/{listId}` node. Clients must read the explicitly permitted child
paths.

## Deployment prerequisites

1. Complete an environment-by-environment owner/member UID audit and resolve every
   ambiguous sanitized-email key manually.
2. Backfill the metadata above using a privileged, idempotent migration with an
   audit report. Never let a browser create or change an ownership binding.
3. Move every browser mutation of protected collections to an authenticated server
   command and verify list authorization there.
4. Replace the anonymous n8n Firebase client with the list-restricted server
   integration principal.
5. Run the emulator cases below against a production-shaped fixture, then stage the
   cutover with a rollback to the previous route-compatible release.

The server-owned n8n ingress also requires these server-only environment values:

- `N8N_WRITE_SECRET`: rotated shared secret sent only by n8n;
- `N8N_ALLOWED_LIST_ID`: the single legacy list key this credential may mutate;
- `FIREBASE_DATABASE_URL`: HTTPS root URL for the intended RTDB environment;
- `FIREBASE_SERVICE_ACCOUNT_JSON` or an environment-provided Application Default
  Credential with RTDB access, plus the existing `FIREBASE_PROJECT_ID` when needed.

## Emulator acceptance cases

Seed two lists with distinct `ownerUid` values, approved members, and one revoked or
pending user. Verify:

1. unauthenticated and anonymous-auth reads and writes are denied everywhere;
2. an owner can read their list children but cannot read another list;
3. an approved member can read only their joined list;
4. a pending, revoked, unbound, or UID-mismatched user cannot read list data;
5. owner, member, and anonymous browser writes to all four protected collections
   are denied, including multi-location writes from the database root;
6. an owner can rename their list and update their config, while members cannot;
7. nobody can create/change `ownerUid`, membership, invites, `memberOf`, or
   `identityBindings` through a client SDK;
8. a user can read only their own identity binding;
9. authenticated non-anonymous reads of `whats_new` succeed and all writes fail;
10. authenticated users can create/update only feedback records whose `userId`
    matches their verified email, and cannot read any feedback records;
11. Admin SDK writes succeed only after the application service independently
    authorizes the principal (tested outside the Rules suite).

Suggested command after adding `@firebase/rules-unit-testing` in the dedicated
cutover ticket:

```sh
firebase emulators:exec --only database "npm test -- --runInBand database-rules.emulator.test.ts"
```
