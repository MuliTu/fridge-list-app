# Kan Create Ticket — skill implementation specification

Status: prepared; personal skill installation is pending. This document is a design and handoff, not an installed skill.
Requested name: `kan-create-ticket`. Display name: Kan Create Ticket.
Scope: global across projects; do not hardcode fridge-list-app as the destination.

## Trigger and outcome

Turn spoken or written feature requests, bug reports and follow-up clarifications into evidence-grounded Kan implementation tickets. Resolve the named project, read its current Spec and Plan, inspect relevant architecture, deduplicate, classify, write through the Kan adapter, and verify the persisted result. Do not implement product code merely because the user asks to create a ticket.

Use Hebrew for the conversation and ticket prose unless the project or user requires another language. Keep code identifiers unchanged. Reuse the provider-neutral ticket-service contract and kan-board-manager adapter when available; do not duplicate their authentication, native schema or lifecycle logic. Discover available Kan MCP tools first. If unavailable, disclose that and use a supported authenticated adapter. Never invent tool names, API shapes, board IDs or successful writes.

## 1. Resolve the project

- Extract project name and aliases from the request and current conversation. A repository location is evidence, not proof of the intended destination.
- Find the canonical workspace, board, project Wiki and repository. Read all pages necessary to resolve aliases and duplicate boards.
- If exactly one destination matches, continue without asking again. If several credible matches remain, ask one focused question before any write.
- If no destination exists, follow the project-resolution policy of the available adapter; never silently use another project's board. Record unsupported provisioning as a blocker.
- Maintain a project context record: canonical name, workspace/board public IDs, repository/ref, Spec/Plan/Wiki identities and versions, source timestamps, existing workflow lists and labels.
- Scope all searches and writes to this project. Never expose tokens or private unrelated project data.

## 2. Summarize the conversation

Capture the problem, actor, user goal, concrete examples, accepted decisions, latest corrections, constraints, non-goals and unanswered questions. Latest explicit user corrections override earlier proposals. Distinguish user requirements, observed facts, proposed implementation and assumptions. Do not turn an assistant suggestion into an approved requirement.

Handle follow-ups such as “also remove the search field” as amendments to the same ticket when scope matches. A distinct bug or independently deliverable feature gets a separate ticket with a textual relationship to the original. Do not bundle unrelated defects into one large ticket.

## 3. Read current project evidence

- Read the actual current Spec, Plan, architecture decisions and relevant project instructions. Do not rely on remembered document content.
- Read nearby tickets, their status, discussions, dependencies and completion evidence, including closed tickets where relevant.
- Inspect current code and configuration to establish what is implemented. Treat uncommitted code, merged code and deployed behavior as separate states.
- Use the repository's required code graph tools for symbols, callers and execution flows. Run impact analysis where required; confirm UNKNOWN or missing graph results through text inspection. Report stale indices and unavailable tooling explicitly.
- Reference the exact file/symbol/ref or document section supporting a claim. Never invent paths, APIs, callers, test results or architectural boundaries.
- If source access is missing, produce a provisional ticket with explicit unknowns and investigation tasks; do not classify missing evidence as Low risk or assert it is ready for development.

## 4. Classify the request

Use separate dimensions:

| Dimension | Values | Rule |
| --- | --- | --- |
| Existing behavior | Implemented / Partial / Absent / Unknown | Cite evidence; existence is not a type label. |
| Work type | Feature / Enhancement / Bug / Documentation | Feature adds capability; Enhancement improves an existing contract; Bug violates the accepted expected behavior. |
| Risk | Low / Medium / High | Assess impact and likelihood, with reasons and mitigations. |
| Priority | Native supported scale, or unspecified | Keep urgency distinct from implementation risk. Do not invent deadlines. |

Risk rubric:

- Low: isolated presentation or local behavior with limited blast radius, established behavior and straightforward rollback.
- Medium: shared components, multiple views, asynchronous state, API contract adjustments or feature interaction with bounded recovery.
- High: authorization, shared-data isolation, destructive writes, schema migration, broad cross-project behavior, production data or uncertain recovery.

Assess UI, frontend state, backend/API, AI prompts/tools, storage, authorization, integrations, deployment and compatibility separately. Use the highest justified overall risk; describe uncertainty separately. An unresolved area is not automatically Low. Preserve a graph tool's original HIGH/CRITICAL/UNKNOWN result verbatim alongside the ticket's three-level risk rather than hiding or downgrading it. Explain any difference in scope.

## 5. Search for duplicates and integrate with the Plan

Search titles, purpose, examples and acceptance criteria, not titles alone. Read the candidate cards before deciding.

- Same outcome and scope: update the canonical ticket while preserving useful content, identity, classifications and discussion; record material new decisions.
- Related but distinct: create a bounded ticket and reference the related stable card identity in text.
- Already implemented: identify remaining differences; do not recreate completed work or claim it is live without deployment evidence.
- State the Plan milestone, Spec requirement and architectural decision affected. Identify conflicts with existing requirements instead of silently rewriting them.
- Add explicit dependencies and a suggested delivery order. Use the board's current workflow list; explain blocked readiness without pretending a label is status.
- Do not change Spec/Plan documents unless authorized; include a proposed documentation delta in the ticket when it is needed.

## 6. Write an actionable agent handoff

Require before/after behavior, concrete entry points, affected layers, data flow, invariants, API/data changes, error and retry behavior, integration points, measurable acceptance criteria, tests and rollback. Separate evidence-backed implementation instructions from options that the implementing agent must investigate.

Use the template below; write “not applicable” with a short reason where a section does not apply. Never pad a UI ticket with unrelated security boilerplate. For AI behavior, define deterministic checks, semantic distinctions and failure behavior rather than prescribing only a prompt change.

```markdown
## Goal and conversation summary
Problem, actor, desired outcome, examples, accepted decisions and non-goals.

## Current behavior and evidence
Implemented / Partial / Absent / Unknown; actual versus expected behavior.
Code references, revision, Spec/Plan/Wiki references and relevant card identities.

## Scope and classification
Work type; relationship to existing features; bounded scope and exclusions.

## Fit with Spec and Plan
Requirement/milestone, related decisions, proposed documentation delta and conflicts.

## Architecture and implementation guidance
| Layer / flow | Current entry point and evidence | Required change | Invariant / interaction |
| --- | --- | --- | --- |
Include UI, state, backend, AI, storage and integrations only where relevant.
Describe the request-to-result flow, ownership boundaries and affected callers.
Distinguish verified paths from proposed paths. List investigation tasks for unknowns.

## Risk
Overall Low / Medium / High, rationale, likelihood and impact, per-area concerns,
original graph verdict and freshness, mitigations, rollback and unresolved evidence.

## Acceptance Criteria
Numbered observable outcomes, negative cases, edge cases and failure behavior.

## Dependencies and agent execution order
Stable related ticket identities or None; prerequisites; ordered implementation steps.
Mark independent work only when boundaries support it. Do not automatically spawn agents.

## Security and Privacy
Relevant authorization, data isolation and logging constraints, or not applicable.

## Compatibility and Migration
Affected existing features, payload/storage changes, rollout/rollback and preservation requirements.

## Testing and completion evidence
Scenario → expected outcome → test level; regression cases and required checks.
Require evidence for acceptance criteria, integration and deployment separately.

## Open questions and assumptions
Material unknowns, provisional choices and readiness blockers.
```

## 7. Publish safely

- Treat an explicit create/update request as authorization for the bounded ticket write; do not add a redundant confirmation step.
- Immediately before writing, read the live target, workflow list, labels and matching cards. Reconcile concurrent changes; avoid overwriting newer content.
- Use existing primary labels matching the work type. Kan labels are classifications; lists hold workflow state. Never invent a native numeric risk field, dependency field or parent relation when unsupported. Store those concerns once in the ticket body.
- Reuse safe adapter operations. A toggle label endpoint requires checking current membership first. Do not blindly retry a toggle or ambiguous create timeout.
- Retry only failures known not to have succeeded. After an ambiguous create response, search and read the project state before retrying. Respect rate limits and preserve successful IDs.
- Freshly read every changed card. Verify title, body, list, labels and any checklist against the intended values.
- If Kan is unavailable, preserve a draft in the project's approved documentation location; state explicitly that no live ticket was created. Never fabricate a card URL or identity.
- Creation does not authorize assignment, messaging people, deadlines, deletion, project visibility changes, implementation, merge or deployment.

## 8. Return a compact result

Report verified ticket title and direct URL, project, work type, risk with its main reason, Spec/Plan connection, dependencies and material unknowns. Distinguish updated existing ticket, newly created ticket and unpublished draft. Do not claim Done, merged or live from a successful ticket write.

## Forward-test scenarios for the installed skill

1. Fridge: combine search/add, remove old search and AI checkbox, recognize onion varieties; preserve distinct variants and existing list behavior.
2. Follow-up: add sticky category headers and quantity defaults; update the canonical ticket only when its bounded scope still matches.
3. Separate shared-list UI bug: compare normal/shared layout, owner identity, categories and selected theme; preserve scoped authorization.
4. Same project alias on two boards: clarify canonical project before writes.
5. Spec says feature complete but code lacks it: record conflict and evidence; do not infer deployment.
6. Kan unavailable or timeout after create: preserve draft or reconcile existing card; no duplicate and no false success.
7. Missing code graph or UNKNOWN impact: mark uncertainty and investigation instead of Low risk.
8. Another project named in the same working directory: resolve its own board and docs rather than using Fridge.
