# Test plan: Settings, sharing and feedback

Last reconciled: 2026-11-10. Status: planned checks, not test results.
Sources: [Spec](spec-settings-sharing-feedback.md), [Decisions](DECISIONS.md),
[Plan and ticket identities](../plans/plan-settings-sharing-feedback.md).

## Per-ticket verification

| Scope | Required evidence |
| --- | --- |
| FR-01 Settings | Language and all preferences have one Settings home; nested Back, Escape and focus return; stored choices and selected list survive; Hebrew/English and 200% zoom. |
| FR-02 Banner | Selected list and owner are clear on desktop and opened mobile list; normal text contrast at least 4.5:1; loading, switching and revoked access remove stale identity. |
| FR-03 Email | Only an exact-list owner can initiate sending; unauthorized calls fail; grant and delivery failures are distinct; repeated adds/resends bounded; one controlled real mailbox receives the email and the link opens the authorized list after sign-in. |
| FR-04 Users | Outgoing/incoming shares scoped correctly; per-list revoke leaves other grants intact; recipient can leave only their own share; forged management requests fail; empty/loading/error states. |
| FR-05 Quick Add | One name and three comma-separated names; whitespace/empty tokens/repeated names/count and length limits; optional AI and guest modes; partial failures retry only failed items. |
| FR-06 Upload | Manual batch input absent only after FR-05; real file import, preview and confirmation preserved; malformed file/cancel/current-list destination regressions. |
| FR-07 Durability | Authenticated record saved before dispatch; stable ID and receipt; failed save cannot show success; provider failure remains durable; direct client writes/status forgery/cross-user reads denied. |
| FR-08 n8n → Kan | Verify workflow activation and destination; authenticated webhook access; one controlled feedback creates one labelled card with original text, submission ID and verified public ID/URL; malformed success responses rejected. |
| FR-09 Retry | Missing/invalid cron authorization rejected; controlled authorized run succeeds; shared Admin configuration; identity reused across all attempts; concurrency, timeout/unknown result and exhausted retries; independent alert path. |
| FR-10 Integration | Combine all relevant checks on the exact candidate; record commit/deployment identity and remaining limits. |
| FR-11 Documentation | Current documents and historical notes agree; stable card links and Wiki context resolve; planned work never described as shipped. |
| FR-12 Preview | Development-only synthetic data; no live Firebase or sharing API calls; desktop multi-column and mobile single-column layouts; category and completed-section interactions; Hebrew/English, RTL/LTR, keyboard and labels; focused tests, TypeScript, production build, isolated preview build, forbidden-string scan and browser-console check. |
| FR-13 List deletion | On one candidate, owner A can confirm and delete only an eligible custom list; recipient B, outsider C, signed-out and forged callers cannot mutate. Permanent/default and no-fallback deletion fail without writes. Concurrent ownership/eligibility changes are rechecked atomically. Hebrew/English confirmation names the list and item count; cancel writes nothing. Success preserves unrelated data and clears deleted-list selection, owner context, items and picker before the feed refreshes; failures remain recoverable. |

## Security fixture

Use owner A, recipient B and unrelated user C with list A shared to B and a
separate list B not shared. Prove B can edit only A and cannot discover/read/edit
B through UI or direct API. Test revoked and left grants, forged IDs and stale
views. For FR-13, compare whole household state before and after each denied
deletion, then verify exact-list removal and unrelated-list preservation after
owner success. Use synthetic records and controlled accounts; do not send unsolicited mail.

## Execution gates

1. Run workflow preflight against the current ticket and hash all four source
   documents. Missing metadata may be prepared from existing instructions, but
   unmet dependencies and conflicting decisions remain blocking.
2. Run relevant focused unit/service/route/UI tests, TypeScript and applicable
   architecture checks on the exact candidate. Follow repository scripts rather
   than inventing test results; inspect package.json at execution time.
3. Check Chrome desktop and mobile layouts, Hebrew RTL and English LTR,
   keyboard access, supported themes and zoom where applicable.
4. For external integrations, separately record database persistence, provider
   acceptance, workflow execution, card read-back and actual mailbox receipt.
   A fake address, HTTP 200 or SMTP acceptance is not end-to-end evidence.
5. Record complete GitNexus change analysis, independent review and reproducible
   output. A change after verification invalidates that verification/review.
6. Production configuration, deployment and historical replay require their own
   authorized scope. Do not claim a failed or unavailable live check passed.

## Evidence format

Record ticket/run ID, exact source revision or candidate hash, command/scenario,
expected and actual outcomes, pass/fail/blocked, bounded logs and remaining
limits. Preserve partial results. Avoid credentials, raw authentication tokens
and unrelated personal data. No checks have been executed by creating this file.
