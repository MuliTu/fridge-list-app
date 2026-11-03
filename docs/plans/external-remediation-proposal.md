# External remediation and release proposal

Status: proposal only. Local documentation/configuration cleanup is authorized and
implemented in the working tree. None of the external actions below has been executed.
Each row is independently approvable; approval of one does not authorize the others.

## Scope, evidence and approval boundaries

| Action | Concrete scope and prerequisite | Verification / recovery |
| --- | --- | --- |
| Historical photo remediation | Prior audit identifies `IMG_2336.jpg` in commit `c63671e` on historical `code-refactor`, absent from main/tags. Re-enumerate remote refs and coordinate with collaborators before deciding whether to remove the blob or replace it with metadata-stripped content. | Preserve an access-restricted offline repository backup, record old/new ref mappings and verify affected refs and replacement metadata. Rewrite/force-push only with explicit approval. Old clones, forks and caches can retain copies; do not promise erasure. Restoring old refs would republish removed content. |
| Historical private documentation | Old `CLAUDE.md` and `CONVERSATION.md` revisions contained personal/operational context. Current-tree replacements preserve engineering decisions without that transcript. Agree affected paths/refs and collaborator migration before any historical rewrite. | Inspect resulting trees and history for the approved content classes; retain restricted recovery copies. GitHub cached views and third-party copies may require separate requests and cannot be assumed removed. |
| Credential response | No privileged secret pattern was found in the earlier 203-commit / 1,677-blob audit; that is not proof of absence. Operational URLs are not by themselves proof of credential compromise. Rotate only a specifically identified credential with a documented exposure or separate owner decision. | Inventory consumers privately, prepare replacement and rollback without publishing values, verify dependent services, then revoke old credential. No rotation has occurred. |
| Production data/rules migration | Review actual approved UID memberships, legacy email references, client rules and server authorization against a privately scoped data inventory. Do not silently approve pending/legacy users. | Backup data/rules under existing access controls, rehearse synthetic migration and denial cases, approve target project, dry-run diff and rollback. No real project was queried or changed by this cleanup. |
| Optional webhooks | Explicit endpoints are required; no deployed host fallback remains in the scoped providers/routes. Verify receiver authentication, principal/list scope, replay prevention, size limits, cancellation and structured failures before enabling. | Test an approved isolated receiver with synthetic data. Record headers/contract without secret values. Missing config returns unavailable before fetch; disable by removing config. A configured endpoint is not evidence of authenticated receiving workflows. |
| Public demo / deployment | First close browser hydration/onboarding, bilingual/accessibility and runtime/auth gates; reconcile upstream and review the complete diff. Select hosting and clarify which fake/real capabilities are exposed. | Record target, build artifact, approved environment, limits, health checks and rollback to a known artifact. The local demo middleware is not a public production security boundary. No deployment or public URL change occurred. |
| Paid / real AI services | Separate explicit budget, provider/model, synthetic evaluation dataset, retention/tracing rules and stopping criteria. | Run approved limited evaluation, record actual calls/costs/quality and failures; revoke optional activation if gates fail. No paid activation or live model call is included here. |

## Optional server endpoint configuration

These are server-only environment values, never `VITE_` variables or request inputs.
Leave them unset to disable the corresponding workflow. Configured values must be
HTTPS URLs without embedded credentials or fragments. Store any future authentication
secret separately after an approved receiver contract; no authentication header has
been invented or asserted as supported by this local change.

| Variable | Consumer |
| --- | --- |
| `CATEGORIZE_ITEM_WEBHOOK_URL` | Item categorization provider |
| `FEEDBACK_WEBHOOK_URL` | Feedback submit provider and authenticated retry job |
| `RECEIPT_SCAN_URL` | Receipt file scanner |
| `RECEIPT_URL_SCAN_ENDPOINT` | Receipt text scanner |
| `PURCHASE_HABIT_SUMMARY_URL` | Optional purchase-habit summarization route |

The isolated demo keeps all these routes disabled regardless of production settings.
Do not paste a real endpoint into this guide. Legacy feedback retry payloads still
contain user/message fields; payload minimization and receiver-side privacy review
remain prerequisites for enabling that optional integration.

## Current public exposure and local recovery

No commit, push, history rewrite, access change or external cleanup request has been
made. Existing public repository content and history therefore remain unchanged.
The latest read-only main-ref observation during this work was
`0e9256702ea9602c39a52163353e3741664155fd`; local HEAD remains
`1606b3a1ea01362837dea99ebe763b1b31571754`. Upstream reconciliation is still open.

Before editing public-facing Markdown, 62 original files were copied into ignored
`.local-private/readiness-docs-20261005/` with a SHA-256 manifest, directory mode 700
and file mode 600. Never force-add this directory. Restore individual files only for
private comparison, not as an automatic public rollback. These backups protect local
recoverability; they do not replace a separately approved repository-history backup.

See the [task backlog](../specs/tasks-flagship-readiness.md) and
[verification log](flagship-progress.md) for exact local evidence and open gates.
