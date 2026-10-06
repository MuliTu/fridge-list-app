---
name: "senior-backend"
description: "Apply senior/staff-level backend engineering judgment to fridge-list-app's server-side surface: the TanStack Start server routes (src/routes/api/*.tsx) and the n8n workflows they proxy to. Use whenever adding or reviewing a server route, an n8n workflow change, error handling, logging, or anything that crosses the client/server or app/n8n trust boundary — not just 'does the request succeed' but 'what does this do when Gemini is rate-limited, n8n is down, or the input is malformed.'"
---

# Backend engineering judgment

TanStack Start routes adapt authenticated requests to feature application services and
infrastructure providers. Consult docs/architecture/module-boundaries.md and the current
module contracts before changing a boundary. The backend also performs authorization,
validation and atomic persistence; it is more than a webhook URL proxy.

Keep secrets and operational endpoints in server configuration. Reject missing or invalid
optional provider configuration before any network request. A configured URL does not
prove receiver authentication; verify that independently before live activation.

Authorize against current UID/list roles on every privileged action. Bound request size,
provider calls and time, propagate cancellation, and validate provider output as untrusted.
Use typed safe errors without raw upstream payloads. Record opaque IDs, event kinds and
bounded timings; never log household names, emails, prompts, tokens or receipt content.

Define recoverable failure behavior and explicit human approval before implementing an
AI success path. Review atomicity and idempotency under concurrent/replayed operations;
a read-then-write check is not proof of safe deduplication. Use approved decision records
in docs/plans for the selected tradeoffs, not a private conversation transcript.

Verify offline/unit and isolated integration cases first. Production workflows, external
messages and paid providers need explicit task scope; local source is not live evidence.
