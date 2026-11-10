# Spec: Settings, sharing and feedback

Status: Active specification. Last revised: 2026-11-10.

Workflow context: [binding decisions and explicit assumptions](DECISIONS.md),
[planned verification](TEST_PLAN.md). These consolidate existing requirements;
they are not evidence of implementation or completed tests.

## Baseline and boundaries

List-scoped sharing is already released in v2.60.2 through [PR #78](https://github.com/MuliTu/fridge-list-app/pull/78). A recipient signs in with the invited email and can access only the granted list. Sending an email is not wired into that grant. This document defines the required next increment; implementation and release status are tracked separately in the delivery progress and GitHub Releases.

Current GitHub main was read separately from the older dirty local branch. Preserve unrelated work. Kan is the current tracker for this increment: [Fridge List App](https://kanban.muli-tu.com/boards/6txqb667swi3). Historical Trello and Trilium plans remain historical; do not duplicate or delete them automatically.

## Product requirements

### FR-01: Consolidate language and preferences inside nested Settings

Move language selection and every preference into hamburger → Settings, with nested panels and a clear Back action.

Inventory existing language, appearance, behavior, purchase gesture/countdown, stock suggestions, purchased-item placement and category settings. Keep navigation/help actions distinct from preferences. Preserve stored choices.

- Header language shortcut is removed; Hebrew/English selector is available under Settings → Language.
- Settings opens nested panels/drawers with clear title and Back; Escape and focus return work without stacking inaccessible dialogs.
- All current preference controls have one canonical home under Settings; language changes preserve route and selected list.
- Phone, desktop, RTL/LTR, keyboard and 200% zoom remain usable; existing saved preferences survive.

### FR-02: Make shared-list identity and owner clearly visible

Fix the reported pale, ambiguous shared-list presentation.

Add an explicit high-contrast identity banner on the selected shared-list page. Desktop: persistent top banner. Mobile: show it when that shared list is opened, not across unrelated pages. Preserve scoped data loading.

- Banner names the selected list, its owner and that it is shared with the current user; meaning is not conveyed by color alone.
- Normal text contrast reaches 4.5:1; banner stays readable in supported themes and RTL/LTR.
- Switching owned/shared lists updates the identity; loading/error/revocation clears stale owner/list information.
- Owner A / recipient B / unrelated C test proves presentation changes never expose or mutate another list.

### FR-03: Send a list-specific email when a participant is added

Notify a recipient by email after a list-specific grant is created.

Wire sending into the authorized sharing service. Existing standalone mail endpoint is not called by the new sharing flow and currently lacks authentication; secure or retire it before enabling delivery. Use existing SMTP abstraction after configuration check.

- Only the verified owner can trigger an email for a participant of that exact list; inviter and list identity are derived server-side.
- Email includes list name, inviter and an app deep link; recipient signs in with the invited address and sees only authorized content.
- Grant success and email failure are reported separately; failed notification never claims delivery or removes a valid grant.
- Deduplicate repeated adds; bound resend/rate limits and handle revoked grants and SMTP timeouts safely.
- Verify one real controlled test mailbox from provider acceptance through inbox/spam receipt; fake addresses never count as delivery evidence.

### FR-12: Maintain a production-parity invitee development preview

Provide a development-only invitee view for reviewing shared-list UX without authenticating against or writing to live Firebase data. The preview must exercise the same visual building blocks as the scoped recipient experience while remaining isolated from production authorization and persistence.

- The preview is available only from the local development server and uses synthetic browser-local data; production builds do not expose the preview route or grant access.
- Desktop uses the available workspace width with a readable multi-column category layout; mobile collapses cleanly to one column without horizontal scrolling.
- Active products are grouped into visible, collapsible category sections with icons, colors and counts; purchased products are separated into a collapsed completed section.
- Adding an item, changing urgency, marking purchased and restoring a purchased item all work locally and never call Firebase or the sharing API.
- Hebrew/English, RTL/LTR, keyboard controls and accessible labels remain usable; focused tests, TypeScript, production build and a real-browser console check pass.

### FR-04: Add Users and sharing management under Settings

Provide one place to understand who can access each list and which lists are shared with me.

Settings → Users with Shared by me and Shared with me; list-to-person mapping, avatars, invite language and authorized removal. Interpret language as preferred notification language per invitation; app UI language remains personal. No permission to change another user's global language.

- Owner sees participants grouped by their own lists; recipient sees only their own grants and the limited roster allowed by the sharing contract.
- Owner can revoke a selected person's access to one list without changing their access to other lists.
- Recipient can leave a shared list, with confirmation; server removes only their own membership and discovery entry.
- Display empty/loading/error states; list-scoped invitation language is visible/editable by owner and used by FR-03 when available.
- Direct API misuse, unrelated-owner discovery and forged revoke/leave requests are denied.

### FR-13: Guard owner deletion of a custom shopping list

An authenticated owner may permanently delete one eligible custom shopping list after an explicit confirmation. The destructive operation belongs to the trusted list-management server path; hiding a menu action is only a presentation safeguard. It must preserve the permanent/default list and leave another selectable list available. Deletion removes only the selected list's items and preserves unrelated household data.

- Derive the actor from the authenticated session and verify ownership of the exact household. Shared participants, unrelated users, signed-out callers and forged owner fields cannot delete or discover another list through this command.
- Revalidate ownership, list identity and remaining-list eligibility in the atomic server operation. A concurrent change or denial leaves data unchanged and returns a safe error. The permanent/default list is never deletable.
- Show the action only to an eligible owner. Hebrew and English confirmation names the list, warns that its items will be removed, shows the affected item count and allows cancellation without a write; keyboard and screen-reader access remain usable.
- After verified success, remove the deleted list from client selection, owner context, item view and list picker before the next realtime snapshot; select a valid remaining list. A failed request retains a recoverable view.
- Verify owner success, recipient/outsider/signed-out denial, forged requests, exact-list isolation, protected and last-list behavior, concurrent changes, bilingual confirmation and safe navigation on the same candidate revision.

### FR-05: Support comma-separated products in the main Quick Add field

Allow adding several groceries at once from the normal What do we need to buy input.

Split on commas, trim entries and ignore blanks. Keep single-product behavior, current list scope and optional AI categorization. Apply to owned and shared-list Quick Add.

- Submitting חלב, לחם, ביצים creates three distinct items in the selected list; one name still creates one item.
- Leading/trailing/repeated commas and whitespace do not create empty products; enforce item/count limits before writes.
- Duplicate policy is explicit: preserve repeated entries unless existing product policy says otherwise; do not silently merge quantities.
- On partial failure keep only failed entries for retry and report successes; retry does not recreate already confirmed items.
- AI receives distinct items when enabled; AI-off and guest modes work without AI.

### FR-06: Remove manual batch-text entry from the file-upload dialog

Use Quick Add as the single entry point for manually typed multiple products.

Remove the upload dialog's manual paste/text product entry after comma Quick Add is available. Preserve actual file upload/import and file-derived preview/review.

- Manual multi-product textbox/action is absent from BulkUploadModal; supported file selection and import still work.
- File-derived product preview, validation and confirmation remain; removing manual text entry does not remove imported content review.
- Relevant help text and translations direct manual product entry to Quick Add.
- Regression checks cover supported file formats, malformed input, cancellation and selected-list destination.

### FR-07: Persist feedback server-side before dispatching external work

Restore durable feedback storage under the current Firebase rules.

Browser currently writes /feedbacks while deployed sharing rules deny that node. Move creation/status transitions into the authenticated server application layer; do not reopen public/client writes.

- Authenticated submission atomically persists actor UID, original request, metadata, stable submission ID and status before dispatch.
- The client receives a receipt/submission ID and can distinguish saved/pending from ticket_created; failed persistence does not show success.
- Client SDK no longer creates or edits authoritative /feedbacks records; users cannot forge processing outcomes or read others' feedback.
- Provider failure remains durably visible for retry; safe errors and redacted correlation logs are available.
- Tests cover denied direct writes, save failure, dispatch failure, unauthorized access and recovery.

### FR-08: Restore configured n8n feedback routing and create tickets in Kan

Make app feedback produce verified cards on this Fridge List App board, replacing Trello for new feedback.

Audit the running workflow and production FEEDBACK_WEBHOOK_URL; choose a stable HTTPS endpoint and machine authentication through Cloudflare Access. n8n may normalize/structure text, but deterministic validation authorizes Kan creation. Keep original Hebrew/English request.

- Read and record current n8n workflow activation, last execution outcome and destination before editing; unverified state is not declared broken.
- Vercel can authenticate to the selected webhook; never point at an Access login page or restore hard-coded ephemeral ngrok URLs.
- A controlled feedback request creates exactly one labelled Kan card on board 6txqb667swi3 with original request, source and stable submission ID.
- Response returns validated provider=kan, card public ID and canonical URL; success requires a real read-back, not any HTTP 200.
- Preserve old Trello links/history; do not bulk-migrate or duplicate historical cards automatically.

### FR-09: Repair feedback cron configuration and end-to-end retry identity

Restore the currently unconfigured retry endpoint and prevent duplicates during recovery.

Live GET /api/retry-feedback returned HTTP 500 not_configured on 2026-11-03. Current handler checks CRON_SECRET first. Retry uses legacy FIREBASE_SERVICE_ACCOUNT_KEY while main composition uses JSON; initial submit and retry do not share a durable upstream idempotency key. Notification also uses the failing feedback path.

- Provision/check CRON_SECRET for Production; unauthenticated requests return 401 and one authorized controlled invocation succeeds.
- Consolidate Firebase Admin configuration using the established safe composition instead of adding divergent credentials.
- Persist and reuse one submission idempotency key across initial request, cron, n8n and Kan; reconcile uncertain provider results before replay.
- Keep bounded max-five retries and atomic claims; define stale processing recovery and never replay unknown outcomes blindly.
- Use an independent operational alert for exhausted failures; update daily 04:00 UTC schedule wording rather than claiming hourly execution.
- Inspect backlog and reconcile against existing Trello/Kan before any bulk replay; no historical replay in the planning stage.

## Decisions and assumptions

- Settings is a nested navigation hierarchy, not multiple competing preference dialogs. Preserve existing stored preferences and list selection.
- The mobile shared-list banner appears only while that list is opened. Desktop keeps the identity visible at the top of that list view. Exact sticky behavior must avoid overlapping the page header.
- Users separates outgoing shares from incoming shares. Removal means owner revocation or the current user's own leave action, never deleting another person's account.
- Language means the current user's UI language and, where configured, per-invitation notification language. It does not permit changing someone else's global preference.
- Commas separate product names. Quantity parsing, quoted commas and automatic merging of repeated products are outside this increment unless existing product contracts require them.
- Email notifies an existing list-scoped grant; the link itself grants no additional access. Grant state and delivery state are separate.
- Custom-list deletion requires the exact household owner and an atomic server recheck. The permanent/default list is protected; a remaining selectable list is required. Confirmation does not grant authority.
- New feedback targets Kan. Preserve old Trello URLs for historical records. n8n can structure the request; validated server/provider code controls mutations.

## Verification and delivery

- Settings nesting and Back/focus behavior work on mobile and desktop; selected shared list has an unambiguous banner.
- Development invitee preview shows the wide categorized desktop layout, single-column mobile layout and isolated local interactions without production data access.
- Comma Quick Add handles success/partial failure and upload still imports files.
- Test recipient edits A but cannot discover/read/edit B; revoke and leave clear stale content.
- Test guarded custom-list deletion end to end with owner A, recipient B and outsider C; verify denials have no write, successful deletion is exact-list scoped, and client state moves to a remaining list.
- Controlled email is actually received and opens the correct list after sign-in.
- One feedback creates one durable submission and one Kan card; timeout/retry still produces at most one card.
- Record exact commit, Vercel deployment, tests and remaining limits; publish GitHub Release notes only for actually released behavior.

Require focused tests, TypeScript and relevant architecture checks. Before code changes, run GitNexus impact on affected symbols; before committing, obtain a complete non-partial/non-truncated change analysis. Use controlled mailbox and feedback test records; do not treat SMTP acceptance, a generic HTTP 200 or fake addresses as receipt evidence. Preserve a deploy/rollback record.

See [delivery plan](../plans/plan-settings-sharing-feedback.md), [feedback audit](../audits/feedback-pipeline-2026-11-03.md) and [GitHub Releases](https://github.com/MuliTu/fridge-list-app/releases).
