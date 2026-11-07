# Engineering guide

Fridge's flagship scope is shared groceries → purchased inventory → reviewed recipe
suggestions → explicit recipe save. Optional integrations are outside the core demo.

## Start here

1. [Run the isolated demo](demo-setup.md).
2. [Understand the architecture](architecture/module-boundaries.md).
3. [Review verified behavior and open gates](plans/flagship-progress.md).

## Decisions worth reviewing

- [Save idempotency](plans/recipe-save-idempotency-decision.md): atomic replay/conflict
  handling, lifetime retention and the cost of deferring deletion.
- [AI failure behavior](plans/chef-fallback-decision.md): recoverable provider failures
  and explicitly curated offline suggestions.
- [Product and AI boundaries](specs/spec-flagship-readiness.md): selected inventory,
  authorization, human approval, nutrition uncertainty and evaluation criteria.

## Active development

The [spec](specs/spec-flagship-readiness.md) defines the contract, the
[plan](plans/plan-flagship-readiness.md) sequences dependencies, and the
[tasks](specs/tasks-flagship-readiness.md) define acceptance gates. Finish the core
browser journey and AI evaluation before expanding optional features.

Other specs/plans are historical design inputs, not evidence of shipped behavior.
The [external remediation proposal](plans/external-remediation-proposal.md) records
separate privacy and production approval boundaries. Personal agent workflows and
session transcripts are local and are not required to build or understand the app.

## Product planning and delivery

- [Settings, sharing and feedback specification](specs/spec-settings-sharing-feedback.md)
- [Binding decisions and assumptions](specs/DECISIONS.md)
- [Acceptance test plan](specs/TEST_PLAN.md)
- [Delivery plan and ticket register](plans/plan-settings-sharing-feedback.md)
- [Local development progress](plans/development-progress-2026-11-03.md)
- [Feedback pipeline audit](audits/feedback-pipeline-2026-11-03.md)

These documents distinguish requirements, decisions, planned verification and
delivery evidence. A documented requirement or local candidate is not evidence that
it was tested, merged, deployed or released.
