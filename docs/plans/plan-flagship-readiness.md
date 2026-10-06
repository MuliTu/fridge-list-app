# Plan: Fridge flagship readiness

Status: Local implementation started on `codex/flagship-readiness`; no deployment authorized.
Progress: [Execution evidence](flagship-progress.md)
Spec: [Flagship readiness](../specs/spec-flagship-readiness.md)
Tasks: [Task breakdown](../specs/tasks-flagship-readiness.md)
Date: 2026-10-05

## Delivery method

Work one reviewable task at a time after owner approval to begin implementation. Preserve unrelated edits; the requested readiness branch is authorized. Do not pull/reset/change the baseline or silently fold in remote code. Refresh GitNexus and run symbol impact before editing; report HIGH/CRITICAL risk, resolve UNKNOWN with source inspection. Before any future commit run complete graph change analysis; partial/truncated output is not a pass. Use the project's React/TypeScript and accessibility skills for UI implementation. No broad rewrite or dependency upgrade campaign.

For every task: owner-facing problem/contract → impact → minimal diff → focused verification → evidence note with commit/mode/commands/result/limitations. Update the feature-state matrix only from evidence. Existing tests are assets to inspect, not proof that they pass. Existing chef plans are historical; reconcile with this milestone rather than repeating completed code tasks.

## Phases and gates

| Phase | Tasks/dependencies | Exit gate |
| --- | --- | --- |
| 0: Agree scope and baseline | FR-001, FR-002 | G0: owner chooses required journeys/access matrix; exact baseline and upstream reconciliation plan recorded |
| 1: Isolated reproduction | FR-003 after G0 | G1: clean-clone synthetic setup runs with no production Firebase/model/workflow egress; seed/reset and authenticated two-user isolation demonstrated |
| 2: Trusted boundaries | FR-004, FR-005, FR-006 after G1 | G2: approved UID/role parity and negative tests pass; four architecture violations resolved; required command paths wired or visibly disabled |
| 3: Reliable chef slice | FR-007 after G2; FR-008 after FR-007; FR-009 after FR-008 | G3: grounding/call/deadline invariants, safe fallback and idempotent save pass under faults; offline journey works in both languages |
| 4: Evaluation and presentation | FR-010, FR-011 after G3; FR-012 after both | G4: automated gates plus owner-observed demo; reproducible README, honest evidence and privacy review complete |
| 5: Optional release/integrations | FR-013 / FR-014 only on separate approval | G5: approved concrete rollout/rollback; authorized isolated real-provider eval passes before real-AI claims; optional integrations individually verified |

At G0, owner explains why exact inventory retrieval is preferable to a vector store here. At G2, owner reviews the pending-membership failure and any migration choice. At G3, owner inspects a prompt-injection and duplicate-save case. At G4, owner narrates architecture and limitations from the documented evidence. These checkpoints preserve learning and judgment; they do not delegate an autonomous rewrite.

## Verification sequence

1. Establish isolation before any command that imports Firebase or makes provider calls. Inspect build/prerender imports and env behavior; the current build wrapper documents a live RTDB connection during prerender.
2. Run targeted unit/service and actual emulator rule tests for the changed contract. The presence of `src/database-rules.test.ts` alone is not emulator-policy enforcement proof.
3. Run `npm run architecture:check`, `npm run test:architecture`, `npm run typecheck`, `npm run test -- --runInBand`, then `npm run build` in the isolated environment. Record each exit code and any skipped integration. Do not substitute build-wrapper completion for a runtime API test.
4. Run `npm run test:e2e` with fake providers and isolated identity/data. Manual browser checks cover two principals, reload, keyboard, phone/tablet, Hebrew RTL/English LTR and outage/conflict handling. Verify no live egress and no sensitive sentinel in logs/artifacts.
5. A separately authorized real-model evaluation records provider/model/prompt versions, latency, rubric and costs; it is not needed for the offline demo but is mandatory for claims of real-model quality.
6. Validate docs links and clean-clone instructions. Before commit, run `detect-changes --scope all --repo .` with refreshed graph; resolve incomplete output. Before release inspect exact final diff and compare approved base, not a stale cached branch.

Do not mark G1–G5 passed in this planning pass. Only the architecture checker and Git/doc inspection ran here; full tests, build, emulator, browser and live provider were not run.

## Risks, stopping conditions and scope discipline

Pause the affected task if access policy needs a data migration, the isolated runtime cannot be proven, a provider needs paid access, or a fix requires broader architecture change. Continue unrelated authorized work. Prefer a visible disabled optional feature over an unsafe simulated success. Receipt/Siri/image/ticket integrations cannot delay the core list → chef → save demonstration.

After a failing verification, record the failing contract and smallest next task. Release is blocked by any unresolved cross-household access, uncontrolled egress, unconfirmed write, unsafe food fallback or critical eval failure. Avoid expanding a failed case into speculative infrastructure.

## External actions require separate approval

Keep current-tree docs/code repair proposals distinct from public-history cleanup, credential operations, production migrations/rules, publishing/deployment and paid provider setup. FR-013 prepares an impact/rollback proposal; FR-014 executes only the exact approved action. No destructive history action is implied by approval of this spec or local implementation.
