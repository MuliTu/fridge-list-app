# Decisions: Settings, sharing and feedback

Authority: the user's requirements and instruction to prepare workflow documents.
Last reconciled: 2026-11-10. Scope: FR-01 through FR-13. This consolidates existing decisions; it
does not authorize a deployment or introduce a new product architecture.

## Sources

- [Specification](spec-settings-sharing-feedback.md)
- [Delivery plan](../plans/plan-settings-sharing-feedback.md)
- [Module boundaries](../architecture/module-boundaries.md)
- [Feedback audit](../audits/feedback-pipeline-2026-11-03.md)

## Binding decisions

1. Preserve the released list-scoped sharing model. A recipient granted list A
   cannot discover, read or edit list B. Enforce authorization on the server;
   presentation and email links confer no access by themselves.
2. Put language and preferences under hamburger → Settings. Use nested panels
   with a clear Back action, accessible focus handling and preserved preferences.
3. Identify the selected shared list and its owner in a readable banner. Show it
   on the opened shared-list view on mobile and at the top of that view on desktop.
4. Put Users under Settings. Separate lists shared by the current user from
   lists shared with them. An owner revokes one list grant; a recipient leaves
   only their own grant. Neither action deletes another account.
5. Email notification follows an authorized grant. Derive sender/list context
   from trusted server data. Report access granted and notification delivery
   separately. Secure or retire the unauthenticated legacy sending endpoint
   before enabling delivery. Actual mailbox receipt requires live evidence.
6. Add comma-separated products through Quick Add, preserving selected-list
   scope and single-product behavior. Trim and ignore blanks; preserve repeated
   entries unless an existing product contract explicitly says otherwise.
   Preserve confirmed successes during partial failure so retry adds only failures.
7. Remove manual multi-product text entry from upload only after Quick Add
   supports it. Retain file import, file-derived preview and confirmation.
8. Persist feedback and authoritative status on the authenticated server before
   external work. Do not reopen client/public writes to repair durability.
9. New feedback targets this project's Kan board. Preserve historical Trello
   records and links. n8n may structure text; validated provider code controls
   card creation. Require a real card identity and read-back for success.
10. Reuse one durable submission identity across dispatch, n8n, retries and Kan.
    Reconcile uncertain outcomes before replay. Preserve bounded retries and
    atomic claims. Do not bulk-replay historical records without reconciliation.
11. Keep credentials server-side and logs redacted. Verify machine authentication
    through Cloudflare Access rather than weakening its protections. Respect
    established module boundaries and demo-environment isolation.
12. Preserve unrelated dirty changes. Use isolated, inspected source revisions;
    run GitNexus impact before symbol edits and complete change analysis before
    commits. Independent review and exact-candidate verification remain required.
13. Keep the invitee preview development-only and synthetic. It may reuse production
    presentation components, but it must not bypass production authentication,
    initialize live Firebase data for the preview, or make shopping-sharing API calls.
14. Only the authenticated exact-household owner may delete an eligible custom shopping list. The trusted server operation rechecks owner, exact list and remaining-list eligibility atomically; the permanent/default list is never deletable. Confirmation and UI eligibility are safeguards, not authorization. Denials and concurrent changes must leave data unchanged; success clears deleted-list client state and selects a remaining list.

## Assumptions requiring explicit treatment

- The Spec proposes per-invitation notification language, separate from personal
  UI language. Treat it as an assumption until its implementation contract is
  accepted; never change another account's global language.
- Sticky positioning must avoid overlapping the header. Exact styling is a
  routine implementation choice within the banner requirements.
- Production webhook, SMTP configuration, active n8n workflow and receipt have
  not been verified by this document. Missing runtime evidence is not approval.
- A new architecture conflict or unresolved product choice must be surfaced;
  documenting it does not silently approve a deviation.
- The permanent/default list counts as a selectable remaining list but cannot be deleted. This is the FR-13 parent-ticket assumption; a contrary storage model requires explicit resolution before changing the deletion contract.
