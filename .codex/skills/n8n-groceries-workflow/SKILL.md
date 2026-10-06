---
name: "n8n-groceries-workflow"
description: "Inspect, edit, validate, or test one of this project's n8n workflows (Siri groceries, receipt photo scanner, receipt URL parser, item categorizer) running on the connected n8n instance. Use when a change is needed to voice-to-list extraction, receipt parsing, or category logic on the n8n side rather than in the React app."
---

# Optional n8n workflows

Workflow identifiers and deployment endpoints belong in private operational configuration.
Do not infer a connected instance or permission to modify it from this repository.
The isolated demo disables these integrations. Live behavior and receiving-workflow
authentication are unverified in the readiness work.

For an authorized workflow task, inspect the target's current configuration first.
Use synthetic input, explicit output schemas, bounded timeouts/retries and stable
operation IDs. Return a structured failure when a provider fails; an empty successful
response is not an acceptable error contract. Error branches may lose binary payloads;
verify file handling explicitly. Verify categories against the application's contract.
Do not use fallback providers to evade quota limits or enable paid services implicitly.

Receipt extraction returns a proposal for human review; it must not directly mutate
stock or receipts. Receiver-side authentication, replay protection and list scope must
be tested before enabling a webhook. A server proxy alone does not secure a receiver.
Never create temporary live debug workflows or query household data without scoped
authorization. Consult docs/plans/external-remediation-proposal.md before live actions.
