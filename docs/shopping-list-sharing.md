# Sharing one shopping list

## Current production state — 3 November 2026

RTDB rules were published through the authenticated Firebase console after the
connector's rule reader failed. The deployed, browser-compatible rules are saved
in `database.sharing.rules.json`; deploy them using `firebase.sharing.json`.
The previous live rules are retained in `docs/firebase-rules-before-sharing.json`
as an audit backup, not as a deployment target.

The existing primary owner UID was confirmed against Firebase Authentication.
Missing owner UIDs were added to the three existing households whose owners were
present in Auth. Unrecognized legacy/test households were left unbound and denied.
No list items were changed by these updates.

Public access to `/users` was removed. Owners retain browser access to their own
list data and preferences. Ownership/membership and scoped sharing records are
server-owned. Legacy root collections (`lists`, `groceries`, `categories`, `stock`,
`receipts`, `admins`) are restricted to the verified primary household owner,
preventing old copies of data from remaining publicly accessible. Old anonymous
or unauthenticated integrations must use the authenticated server integration.

Firebase Rules Playground confirmed: unauthenticated household reads denied;
owner reads and grocery writes allowed; another signed-in user's reads and writes
denied; browser ownership changes denied; legacy owner writes allowed and other
users' legacy writes denied. The live app was reloaded and the primary owner's
shopping items loaded successfully under the new rules.

The new application code has not been deployed from this task. Scoped sharing
still needs that deployment, configured Firebase Admin credentials, and
`SHOPPING_LIST_SHARING_ENABLED=true` in the application server. Fresh accounts are
provisioned by the new authenticated `provision` action; it refuses to self-claim
existing unbound legacy data. The server flag does not block own-list signup.

The list toolbar and the sidebar sharing entry open the same dialog for the
currently selected shopping list, including the permanent list. Members appear as
profile photos with initials as a fallback. The owner can add an email or remove
a member. An invite does not send email; it appears in the recipient's **Shared
with me** section when they sign in with that verified address, including if the
address was invited before signup. Avatars represent participants, not online
presence.

## Isolation

Shopping lists inside a household are identified by `groceries[*].list_name`.
The legacy household invite mechanism grants access to all of a household and
must not be used for the new sharing UI.

New server-owned records:

- `shoppingListShares/{sha256([householdId, listName])}` holds the exact scope,
  authoritative owner UID, owner profile and members keyed by hashed email.
- `shoppingListShareIndex/{sha256(normalizedEmail)}/{shareId}` provides discovery
  without scanning other households.

`/api/shopping-sharing` verifies Firebase authentication and verified email. Only
the household's `ownerUid` can manage shares. An invited person can read or mutate
only matching grocery items; arbitrary item fields, changing list scope, guessed
IDs and cross-list item IDs are rejected. Updates/deletes recheck scope inside a
Firebase transaction. Revocation removes the grant and discovery pointer in one
atomic update. Subsequent requests are denied; open guest pages refresh every
five seconds and discovery refreshes every ten seconds. Requests are uncached.

The guest view supports add, purchased status (including the existing undo delay),
urgency, name/note editing and deletion. It does not fetch household categories,
other list names, stock, receipts, recipes, image documents or household metadata.
Existing household-wide memberships are not automatically revoked by this change;
someone already given broader access retains that separately granted access.

## Activation in Firebase

Sharing is **disabled by default** on the server. Set
`SHOPPING_LIST_SHARING_ENABLED=true` only after the following checks.

1. Configure Firebase Admin credentials using `FIREBASE_SERVICE_ACCOUNT_JSON` or
   `FIREBASE_SERVICE_ACCOUNT_KEY`, `FIREBASE_DATABASE_URL` and `FIREBASE_PROJECT_ID`.
   Production project: `n8n-vocal-2-db`; RTDB instance:
   `n8n-vocal-2-db-default-rtdb` in `europe-west1`.
2. Back up production rules and data. Run
   `node scripts/migrate-shopping-sharing.mjs` for a dry-run. It compares the full
   Auth user directory with existing household keys, rejects ambiguous email-key
   collisions, disabled/unverified identities and conflicting owner metadata.
   After reviewing the report, run the same command with `--apply`. It writes only
   missing owner UID/email metadata, never list contents or household membership.
3. Audit and apply RTDB rules so guests cannot read/write other households
   directly or modify the new sharing/index records. A broad parent `.read` or
   `.write` grant cannot be overridden by a child denial. The new nodes are
   explicitly denied in `database.rules.json`.
4. **Do not deploy the entire existing `database.rules.json` blindly.** It is a
   separate server-owned-write cutover target and currently blocks legacy browser
   mutations. Complete the prerequisites in `database.rules.md` or merge the
   isolated sharing changes into audited, route-compatible production rules.
5. Verify with two real accounts: invite to A; confirm discovery and editing A;
   request B by ID and try editing a B item; confirm direct SDK reads to the
   owner's household are denied; revoke A and confirm reads/writes stop.
6. Enable the server flag and deploy the app. No Firestore schema/index/rules
   change is needed for this feature; it stores sharing authority in RTDB.

The local CLI remains unable to reach Firebase APIs (`ENOTFOUND`). The Firebase
console was used to apply and verify the production updates described above.

## Checks

```sh
npm test -- --runInBand shoppingSharing ListSharingBar.test.tsx SharedShoppingLists.test.tsx database-rules.test.ts
node --test scripts/migrate-shopping-sharing.test.mjs
npm run typecheck
```

Validation before the final Firebase update: 34 focused Jest cases, two
owner-binding migration cases, and TypeScript passed. Subsequent checks cover
the browser-compatible rules and own-list signup. The full Jest suite also passed
(777 cases before later focused cases were added). Client and server compilation passed;
the complete build stopped at prerender because the environment denied binding
the preview server (`listen EPERM`). The database emulator was similarly blocked
from opening a local port. Rules were subsequently checked with the live console
simulator; an actual two-account shared-list browser run remains outstanding.
The architecture check reports eight existing violations in
other modules; it reports none in the new sharing module.
