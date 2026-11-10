# Feedback pipeline audit — 2026-11-03

Scope: read-only source and service checks for the next delivery cycle. No workflow, production configuration or historical feedback was changed. No test feedback or invitation was sent.

## Evidence and limits

| Finding | Evidence | Classification / next step |
| --- | --- | --- |
| Retry endpoint is unconfigured | Live GET /api/retry-feedback returned 500 with not_configured. Current handler returns this status at its first CRON_SECRET guard. | Confirmed current configuration failure; FR-09. No authenticated retry was triggered. |
| Feedback durability conflicts with access rules | Current client submitFeedback calls createFeedbackRecord/updateFeedbackRecord directly at /feedbacks; sharing rules default-deny and grant no client access there. | Confirmed source/rules mismatch; FR-07. Actual record loss count was not queried. |
| Main no longer hard-codes ngrok | Current N8nFeedbackProvider takes FEEDBACK_WEBHOOK_URL from ServerComposition through configuredWebhook. Older local code still hard-codes ngrok. | Do not implement an already-completed URL refactor again. Live variable value remains unverified. |
| Initial and retry identities differ | Initial provider uses request operationId as Idempotency-Key. Retry payload has no same key/header and no durable submission identity spanning both paths. | Duplicate risk; FR-07/FR-09. Workflow-side idempotency is unverified. |
| Retry uses a separate Admin credential convention | firebaseAdmin.server.ts requires FIREBASE_SERVICE_ACCOUNT_KEY; main composition uses FIREBASE_SERVICE_ACCOUNT_JSON. | Source compatibility gap; check actual Production provisioning without revealing values. |
| UI can report success without a confirmed card | Provider accepts a non-error object, and deriveTicketFromN8nResponse can return null; client still marks ticket_created. | Require Kan public ID, URL and read-back; FR-08. |
| Retry maintainer notification shares the same dependency | notifyMaintainers posts through the same feedback webhook. | Outages may also suppress alerts; independent alert path in FR-09. |
| Retry is daily, not hourly | vercel.json schedules 0 4 * * * UTC; some comments/text describe hourly behavior. | Correct documentation, not an assumed scheduler change. |
| New feedback provider target is historical Trello | Older specs, comments and response shape refer to Trello; no end-to-end Kan feedback integration was verified. | Replace the destination for new feedback in FR-08; retain historical links. |
| n8n public health check redirects | GET /healthz returned HTTP 302 from Cloudflare. | This proves an access gate/redirect, not that n8n or its workflow is down. Verify machine authentication and actual workflow runs. |
| Email invitation endpoint exists separately | send-invite-email.tsx uses SMTP abstraction but lacks route authentication; scoped shopping-sharing grant never calls it. | Secure/retire endpoint and integrate owner-authorized sending in FR-03. SMTP config and receipt remain unverified. |

## Recovery order

1. FR-07: persist authenticated feedback on the server with a stable submission ID before external work.
2. FR-08: read active n8n workflow, last executions, provider credentials and board destination through authorized APIs; configure stable authenticated webhook access and validated Kan result contract.
3. FR-09: restore cron secret, unify Admin configuration, propagate stable idempotency keys, reconcile uncertain outcomes and add independent alerting.
4. FR-10: send one controlled request and verify persisted submission, workflow execution and exactly one Kan card. Replay safely and prove no duplicate.

Do not bulk-replay stored feedback before comparing existing provider records. Do not remove Firebase isolation to repair durability. Inspect secrets only by presence/configuration metadata; never copy them into tickets or docs.

## Historical documentation reconciliation

- docs/specs/spec-agent-create-ticket.md and docs/plans/plan-agent-create-ticket.md describe a non-production LangGraph/Trello experiment. Significant code exists despite an unchecked draft checklist. Treat as historical/unreconciled, not a new eleven-ticket backlog.
- Current main docs/plans/flagship-progress.md is an explicitly dated 2026-10-06 checkpoint. Its tests and production gates are evidence for that revision, not a current acceptance report.
- Current main docs/README.md is newer than local docs/README.md. Do not overwrite it with the local copy when publishing planning changes.
- docs/shopping-list-sharing.md is the current usage guide for released list-scoped sharing. Preserve it; email notification is a planned follow-up.
- No existing CHANGELOG file was found in the local docs inventory. The new docs/CHANGELOG.md is a scoped planning/release index; the app's existing in-app release/change history remains intact.

Source snapshot: current GitHub main files were fetched through the GitHub connector on 2026-11-03. The local GitNexus graph is useful for locating flows but describes the local indexed tree, not a guarantee of current remote or deployment state.
