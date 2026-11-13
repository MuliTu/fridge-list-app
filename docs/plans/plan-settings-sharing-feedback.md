# Plan: Settings, sharing and feedback

Created: 2026-11-03. Last reconciled: 2026-11-10. Status: local implementation in progress; see [current progress](development-progress-2026-11-03.md).

Readiness preparation now includes [Decisions](../specs/DECISIONS.md) and
[Test Plan](../specs/TEST_PLAN.md). Reuse these authoritative files and normalize
card metadata before preflight; do not bypass unmet dependencies or count planned
checks as passed. The global workflow update is prepared in
`../workflow/development-workflow-readiness.patch`; its installation was blocked
by workspace write restrictions and it is not active yet.

Canonical board: [Fridge List App](https://kanban.muli-tu.com/boards/6txqb667swi3). Coordination: [FR-00](https://kanban.muli-tu.com/cards/pcby47m957sg).

## Ticket register

| Ticket | Work | Type | Priority | Dependencies |
| --- | --- | --- | --- | --- |
| [FR-01](https://kanban.muli-tu.com/cards/yzcmj6k5ryml) | Consolidate language and preferences inside nested Settings | Enhancement | P1 | None |
| [FR-02](https://kanban.muli-tu.com/cards/34xp28wc30nv) | Make shared-list identity and owner clearly visible | Bug | P1 | None |
| [FR-03](https://kanban.muli-tu.com/cards/fpzdxlk4q9f5) | Send a list-specific email when a participant is added | Feature | P1 | None |
| [FR-04](https://kanban.muli-tu.com/cards/55j5ijn9s4xu) | Add Users and sharing management under Settings | Feature | P1 | [FR-01](https://kanban.muli-tu.com/cards/yzcmj6k5ryml) |
| [FR-05](https://kanban.muli-tu.com/cards/41ijspeppkte) | Support comma-separated products in the main Quick Add field | Enhancement | P1 | None |
| [FR-06](https://kanban.muli-tu.com/cards/65rgquhpyqbh) | Remove manual batch-text entry from the file-upload dialog | Enhancement | P2 | [FR-05](https://kanban.muli-tu.com/cards/41ijspeppkte) |
| [FR-07](https://kanban.muli-tu.com/cards/l5r85bwkrwdp) | Persist feedback server-side before dispatching external work | Bug | P0 | None |
| [FR-08](https://kanban.muli-tu.com/cards/vja815wov18o) | Restore configured n8n feedback routing and create tickets in Kan | Enhancement | P1 | [FR-07](https://kanban.muli-tu.com/cards/l5r85bwkrwdp) |
| [FR-09](https://kanban.muli-tu.com/cards/nnclzjhle2mo) | Repair feedback cron configuration and end-to-end retry identity | Bug | P0 | [FR-07](https://kanban.muli-tu.com/cards/l5r85bwkrwdp), [FR-08](https://kanban.muli-tu.com/cards/vja815wov18o) |
| [FR-10](https://kanban.muli-tu.com/cards/gpjmn6x5trnm) | Verify the integrated mobile, sharing, email and feedback journeys | Enhancement | P1 | [FR-01](https://kanban.muli-tu.com/cards/yzcmj6k5ryml), [FR-02](https://kanban.muli-tu.com/cards/34xp28wc30nv), [FR-03](https://kanban.muli-tu.com/cards/fpzdxlk4q9f5), [FR-04](https://kanban.muli-tu.com/cards/55j5ijn9s4xu), [FR-05](https://kanban.muli-tu.com/cards/41ijspeppkte), [FR-06](https://kanban.muli-tu.com/cards/65rgquhpyqbh), [FR-09](https://kanban.muli-tu.com/cards/nnclzjhle2mo) |
| [FR-11](https://kanban.muli-tu.com/cards/qrnmbbxfwkqt) | Reconcile current specifications, plans and release history | Documentation | P1 | None |
| [FR-12](https://kanban.muli-tu.com/cards/rp8iqj4iqtua) | Maintain a production-parity invitee development preview | Enhancement | P2 | [FR-02](https://kanban.muli-tu.com/cards/34xp28wc30nv) |
| [FR-13](https://kanban.muli-tu.com/cards/4uvxbtwpelh2) | Guard owner deletion of a custom shopping list | Enhancement | P1 | [FR-13A](https://kanban.muli-tu.com/cards/7r38kuc8ji65), [FR-13B](https://kanban.muli-tu.com/cards/1vau0wxc2qjt) |

The initial cards started in Backlog; consult Kan for their current state. P0/P1/P2 and dependencies are descriptive text because Kan has no native priority or dependency field. No deadlines or assignments were invented. Native labels describe type, native lists describe progress. Acceptance checklists are unfinished until evidence supports them.

## Delivery sequence

1. Establish the source baseline from current main in a clean worktree; compare and preserve the original dirty branch. Read the Spec and audit. Run per-symbol GitNexus impact before implementation.
2. Repair feedback durability first (FR-07). At the same time, independent UI work can prepare Settings (FR-01), shared-list banner (FR-02), and Quick Add (FR-05). These are conceptual lanes, not instructions to spawn agents.
3. Build Users after Settings (FR-04). Implement email notifications (FR-03) with a compatible notification-language contract; coordinate with Users to avoid rewriting shared DTOs.
4. Remove manual batch text from upload only after Quick Add works (FR-06).
5. Restore n8n-to-Kan delivery after durable persistence (FR-08), then configure and verify retries with stable identity and independent alerts (FR-09). Do not replay historical records in bulk.
6. Run the integrated owner/recipient/outsider, mobile, email receipt and feedback tests (FR-10). Record deployment and rollback evidence. Reconcile docs/GitHub Release notes (FR-11) as gates close.
7. Keep the invitee development preview (FR-12) isolated from production data while using it to review the recipient layout at desktop and mobile widths.
8. For FR-13, integrate the trusted owner-only atomic deletion path from FR-13A with the guarded confirmation and safe list fallback from FR-13B. Close the parent only after both children are Done and the same candidate passes owner/recipient/outsider, protected-list, concurrency, exact-list, bilingual and post-delete state checks.

Recommended first implementation: FR-07, because it closes a known loss-of-recovery gap. FR-01 is the first independent product UI change. FR-02 can be delivered independently with low business coupling. Quick Add and upload changes share a surface and should be coordinated. Max useful independent work lanes: feedback, settings/users, list UI; current execution remains a single coordinated task unless separately requested.

## Readiness and unknowns

- Existing scoped sharing is delivered; do not rebuild it. The new tickets are follow-up behavior.
- CRON_SECRET is missing according to the live endpoint and current guard order. Actual webhook value, active n8n workflow, workflow credentials and SMTP provisioning still require authorized configuration/API inspection.
- A Cloudflare 302 is not evidence that n8n is stopped. Configure machine-to-machine access rather than weakening Access protections.
- Existing standalone invitation email route needs authentication and exact-list authorization before SMTP is enabled.
- Language placement is fixed by the request. Per-invitation language is an explicit planning assumption; no changing another account's global setting.
- The draft historical LangGraph/Trello checklist does not reflect implemented code and is not the canonical execution plan for this increment.
- The local branch snapshot recorded in this plan by 2026-11-10 contained committed FR-12 preview work at `be6bfa6` plus a
  broad uncommitted candidate spanning Settings behavior, shared-list UI/API/rules,
  item interactions and supporting tests. Split verification by ticket and do not
  infer a single release state from the combined working tree. See the dated
  [progress reconciliation](development-progress-2026-11-03.md) for the later
  fetched-main and local-checkout observations.

## Release gates

- Acceptance checks on each card, targeted regression tests, TypeScript and relevant architecture checks.
- Complete GitNexus change analysis before commit, no partial/truncated result accepted; disclose HIGH/CRITICAL impact before editing.
- Preview verification and controlled live mailbox/feedback evidence. SMTP accepted is not the same as inbox receipt; saved feedback is not the same as a created card.
- No unscoped Firebase rule relaxation. No guessed provider success or unsafe replay after an uncertain result.
- Record real shipped changes in [GitHub Releases](https://github.com/MuliTu/fridge-list-app/releases). Planning does not count as deployment.

See [Spec](../specs/spec-settings-sharing-feedback.md) and [audit](../audits/feedback-pipeline-2026-11-03.md).
