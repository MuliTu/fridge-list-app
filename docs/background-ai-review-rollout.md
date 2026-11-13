# Background grocery review

The web app offers background review to the active list’s owner and approved
editors when the server flag is enabled. The bell explains the Groq transfer
before enabling reviews for the signed-in user in the current tab.

## Production configuration

- Keep `BACKGROUND_AI_REVIEW_ENABLED` unset or `false` until rollout is approved.
- Use the existing server-only `GROQ_API_KEY`, or set
  `GROQ_BACKGROUND_REVIEW_API_KEY` to override it for this workload. A dedicated
  project is optional and helps isolate quota. Check organization-level
  request and token limits before setting the flag to `true`.
- Verify the account’s data retention settings before enabling. Groq receives
  grocery names, purchase state, sub-list grouping as numbers, temporary row
  numbers, and the requested language. Review the account controls for customer
  data retention and tracing. [Groq data controls](https://console.groq.com/docs/your-data)
- Require Firebase Admin credentials and the application’s production RTDB
  root URL. The shared quota state lives under
  `_server/backgroundAiReview/groq`. Keep that branch inaccessible to browser
  clients. A lease permits one provider call at a time and spaces starts by at
  least 60 seconds from actual dispatch across background-review instances using
  that database. Other features using the same Groq key are outside this lease. Provider HTTP 429
  responses extend the cooldown. The browser retries once when the server’s
  wait fits within 75 seconds. [Groq rate limits](https://console.groq.com/docs/rate-limits)
- The app offers review for lists of up to 300 groceries with names of up to
  200 characters. Observe the capability, review, and confirmation request
  statuses during rollout and use the Groq dashboard for organization-wide
  consumption.

To roll back, set `BACKGROUND_AI_REVIEW_ENABLED=false` and restart or redeploy
the app with the new environment. Remove the Groq secret if retiring the
integration. The normal shopping list and persisted duplicate bell continue
to work. Review results and unread state live in the open tab.

## Synthetic Groq verification

Use a fresh synthetic demo database and reserve a fixture list for this test.
Give the fixture a signed-in owner and grocery names that match
`Synthetic grocery <1–4 decimal digits>`. Seed 300 rows, including duplicates
within the same sub-list and purchase status. Point
`BACKGROUND_AI_REVIEW_SYNTHETIC_CREDENTIAL_FILE` at a private temporary file
containing a dedicated test key. Export `BACKGROUND_AI_REVIEW_ENABLED=true`
and `BACKGROUND_AI_REVIEW_SYNTHETIC_LIST_ID=<fixture-list-key>`, then start
`npm run demo:dev` using the ordinary isolated demo configuration. This opens
only that list’s review endpoint and accepts only the synthetic name pattern.
The default demo session uses no Groq requests.

Watch for review progress, then open the bell notification and confirm the
suggestions dialog opens without another review POST. Leave the list
unchanged through a debounce interval and check that no POST occurs. Rename a
nonduplicate row to another synthetic name in the browser and confirm the
new progress and notification. Allow time for quota backoff. Unset the three
exported variables and delete the temporary key file when finished.

## Confirmation, replay, and bounded work

Confirmation captures the actor UID and exact list, with cancellation on modal
unmount or scope change. The server compares that actor to the verified token
and atomically rechecks owner/editor access and the reviewed content digest.
Image-backed removals are ineligible: they appear as skipped, leaving both row
and image intact. Rename and ordinary removal retain the established history
fields and modified metadata.

The RTDB transaction stays at `users/{listId}`, the existing lowest common
ancestor of membership, groceries and audit. Moving it to groceries alone would
lose atomic membership and audit checks. The shared export-format REST/ETag transaction preserves concurrent changes and
only groceries, listChangeHistory and backgroundReviewOperations change; receipts, stock, config, membership and other
subtrees remain identical. Before and after transaction values must fit 1 MiB,
and at most 300 groceries and 500 operation receipts are accepted. The REST reader and writer both enforce the byte limit. Unrelated Firebase priority metadata is preserved verbatim. If a value this
command must decode (owner UID, confirming membership, grocery snapshot, selected
replay receipt) contains priority metadata, application is ineligible. The export
is checked before every conditional write, including retries after an ETag conflict. Their ordinary grocery commands remain available.
Oversized households fail without applying changes and can use ordinary grocery
commands. No storage migration or historical cleanup is performed.

Each confirmation uses a stable UUID, scoped by principal/list/action and a
canonical payload fingerprint. Same-payload retries return the original result
without duplicating audit; changed-payload reuse conflicts. Receipts persist with
the household (no automatic expiry); reaching 500 receipts disables new review
applications until a separately approved retention/maintenance policy exists.
An uncertain response can be retried from the open modal with the same selection.
Revoked access is rejected even for replay.

Each browser analysis attempt has a 45-second deadline including hashing, token
acquisition, HTTP and parsing. A single bounded backoff accepts a Retry-After
value up to 75 seconds, plus a 250 ms scheduling margin, between attempts. Server analysis has a 45-second attempt deadline, five-second
Firebase operation deadlines, and a 25-second provider deadline. Lease cleanup
waits at most five seconds. Late outcomes cannot publish a result or dispatch a
new provider call. The 120-second lease protects delayed dispatch and failed
finalization; successful finalization records dispatch + 60 seconds and any
provider retry interval. An uncertain mutation may finish in Firebase after a
transport timeout; the stable operation receipt makes retry recoverable.
