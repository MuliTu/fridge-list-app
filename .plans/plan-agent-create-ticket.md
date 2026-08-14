# Plan: LangGraph Create-Ticket Agent

Status: Draft
Related spec: `../.specs/spec-agent-create-ticket.md`

## Ticket checklist

- [ ] **[agent-ticket-v1][01] Add LangGraph dependencies and server config** — [Trello ticket](https://trello.com/c/sALfmpTp)
- [ ] **[agent-ticket-v1][02] Add non-production guard and UID authorization** — [Trello ticket](https://trello.com/c/0QgHeLlY)
- [ ] **[agent-ticket-v1][03] Add protected agent-entitlement API** — [Trello ticket](https://trello.com/c/qRr14ePh)
- [ ] **[agent-ticket-v1][04] Load the managed prompt from LangChain admin** — [Trello ticket](https://trello.com/c/AB3EPlXy)
- [ ] **[agent-ticket-v1][05] Define ticket provider contract and fake provider** — [Trello ticket](https://trello.com/c/IQ5o2rez)
- [ ] **[agent-ticket-v1][06] Implement Trello ticket provider** — [Trello ticket](https://trello.com/c/NJJhcwor)
- [ ] **[agent-ticket-v1][07] Create the validated create_ticket tool** — [Trello ticket](https://trello.com/c/OGZ032Nt)
- [ ] **[agent-ticket-v1][08] Build the bounded LangGraph create-ticket agent** — [Trello ticket](https://trello.com/c/ywoWH17I)
- [ ] **[agent-ticket-v1][09] Implement POST /api/agent/create-ticket** — [Trello ticket](https://trello.com/c/a2JbSuRn)
- [ ] **[agent-ticket-v1][10] Route granted feedback users to the agent API** — [Trello ticket](https://trello.com/c/9cU29TRE)
- [ ] **[agent-ticket-v1][11] Verify the complete non-production rollout** — [Trello ticket](https://trello.com/c/0yP62sOZ)

## 1. Architecture

```text
Feedback UI
    |
    |-- granted user --> POST /api/agent/create-ticket
    |                         |
    |                         |-- environment guard
    |                         |-- Firebase authentication
    |                         |-- UID allowlist
    |                         |-- request validation
    |                         |
    |                         `-- LangGraph agent
    |                               |
    |                               |-- prompt from LangChain admin
    |                               |-- chat model
    |                               `-- create_ticket tool --> Trello
    |
    `-- other user ----> existing /api/submit-feedback --> n8n
```

Main boundaries:

- **Route:** security, validation, configuration, and HTTP responses.
- **Prompt loader:** retrieves and validates the managed LangChain prompt.
- **Agent graph:** turns feedback into one structured tool call.
- **Ticket tool:** validates ticket data and calls a provider.
- **Provider:** contains Trello-specific API behavior.
- **UI routing:** selects the new flow only for granted users.

## 2. Key decisions and reasoning

- Use Firebase UID allowlisting because UID is stable and already returned by `verifyAuthToken`.
- Keep authorization on the server even if the UI knows which flow to show.
- Return `404` in production so the experimental route cannot be used or easily discovered there.
- Keep the existing n8n flow unchanged to reduce rollout risk.
- Fetch a pinned prompt from LangChain administration so prompt changes are controlled and repeatable.
- Give the agent only one mutating tool and allow one invocation to prevent duplicate tickets.
- Separate the ticket provider from the agent so Trello can be replaced without rewriting the graph.
- Start with an in-memory fake provider so local and automated tests do not create real tickets.

## 3. Task breakdown

### Task 1: Dependencies and configuration

Add the LangGraph, LangChain core, model adapter, and schema-validation dependencies.

Define and validate:

- `AGENT_CREATE_TICKET_ENABLED`
- `AGENT_CREATE_TICKET_ALLOWED_UIDS`
- `AGENT_CREATE_TICKET_MODEL`
- `AGENT_CREATE_TICKET_PROVIDER`
- `LANGCHAIN_API_KEY`
- `AGENT_CREATE_TICKET_PROMPT_ID`
- `AGENT_CREATE_TICKET_PROMPT_VERSION`
- Model and Trello credentials

Done when:

- Configuration has typed accessors.
- Missing configuration fails safely.
- No server secret uses a `VITE_` prefix.

Depends on: nothing.

### Task 2: Access control and environment guard

Create reusable checks for:

- Non-production environment.
- Explicit feature enablement.
- Firebase authentication.
- UID allowlist membership.
- Local `dev-bypass` UID when explicitly allowed.

Done when:

- Production and disabled environments return `404`.
- Invalid authentication returns `401`.
- Non-granted users return `403`.
- Tests prove the model and ticket provider are not called after rejection.

Depends on: Task 1.

### Task 3: Prompt loader

Create a server-only module that:

- Fetches the prompt from LangChain administration.
- Uses the configured prompt ID and optional pinned version.
- Validates the returned prompt format.
- Maps retrieval failures to a safe internal error.
- Optionally caches the prompt for a short period.

Done when:

- The graph receives the managed prompt.
- Credentials and prompt contents never appear in API responses or logs.
- Success, invalid-prompt, and provider-failure tests pass.

Depends on: Task 1.

### Task 4: Ticket provider and tool

Define a provider-neutral `TicketProvider` interface and implement:

- A deterministic fake provider.
- A Trello provider.
- A `create_ticket` LangChain tool with input validation.
- Timeout and safe error handling.

Done when:

- The tool accepts only valid structured ticket data.
- The fake provider works without network access.
- Trello responses are normalized to the shared ticket result.
- Provider errors cannot leak credentials.

Depends on: Task 1.

### Task 5: LangGraph agent

Build the bounded graph:

```text
START -> model -> create_ticket -> finalization -> END
```

Enforce:

- Managed system prompt.
- One available mutating tool.
- One ticket creation at most.
- A recursion/step limit.
- Failure when no ticket is created.
- No persistent memory between requests or users.

Done when:

- A valid request produces exactly one normalized ticket.
- Zero-tool, duplicate-tool, model-failure, and loop-limit tests pass.

Depends on: Tasks 3 and 4.

### Task 6: API route

Implement `POST /api/agent/create-ticket` in this order:

1. Create `runId`.
2. Apply environment guard.
3. Authenticate.
4. Authorize UID.
5. Parse and validate the request.
6. Load the managed prompt.
7. Invoke the graph.
8. Return the normalized ticket.

Done when:

- The route matches the spec's request, success, and error contracts.
- Successful creation returns `201`.
- Known failures map to safe status codes.
- Logs contain only safe metadata.

Depends on: Tasks 2, 3, and 5.

### Task 7: UI flow selection

Update the feedback submission flow:

- Granted users call the agent route.
- Other users continue to `/api/submit-feedback`.
- A pre-execution `403` may fall back to n8n.
- No fallback occurs after ticket creation or an uncertain provider result.

Use a protected entitlement result; do not expose the complete allowlist.

Done when:

- Both user paths work.
- The current n8n behavior remains unchanged for non-granted users.
- UI tests cover granted, non-granted, and safe fallback behavior.

Depends on: Task 6.

### Task 8: End-to-end verification

Verify:

- Multiple granted UIDs can create tickets independently.
- Non-granted users stay on n8n.
- Production always blocks the new route.
- The prompt is loaded from LangChain administration.
- Exactly one ticket is created per successful request.
- Existing tests and production build remain green.

Done when:

- Unit, route, integration, and relevant UI tests pass.
- A local fake-provider smoke test succeeds.
- A controlled non-production Trello test succeeds.

Depends on: Tasks 6 and 7.

## 4. Suggested task ownership

Tickets that can run in parallel after ticket 01:

- Track A: tickets 02 and 03 — access control and entitlement.
- Track B: ticket 04 — prompt loader.
- Track C: tickets 05, 06, and 07 — provider and tool.

Then:

- Ticket 08 combines Tracks B and C.
- Ticket 09 combines Track A with ticket 08.
- Ticket 10 follows the completed APIs.
- Ticket 11 verifies the full flow.

## 5. Synchronous vs. asynchronous work

Here, **async** means tickets can be worked on in parallel. **Sync** means a ticket must wait for its dependencies to finish.

### Async groups

| Group | Tickets | Start condition |
| --- | --- | --- |
| Foundation | 02 Access control, 04 Prompt loader, 05 Provider contract/fake | Start together after ticket 01 |
| Provider work | 03 Entitlement API, 06 Trello provider, 07 Ticket tool | Start when each ticket's direct dependency is ready |
| Final verification prep | Parts of 11 such as test scenarios and fixtures | Can be prepared while tickets 08-10 are being built |

Ticket 03 can start after 01 and 02.
Ticket 06 can start after 01 and 05.
Ticket 07 can start after 05; it does not need to wait for the Trello provider because it can use the fake provider.

### Sync chain

```text
01 Configuration
  -> 04 Prompt loader
  -> 08 LangGraph agent
  -> 09 Create-ticket API
  -> 10 UI routing
  -> 11 Full verification
```

Additional required dependencies:

```text
01 -> 02 -> 03 -> 10
01 -> 05 -> 07 -> 08
01 -> 05 -> 06 -> 11
02 -> 09
```

### Ticket execution type

| Ticket | Type | Reason |
| --- | --- | --- |
| 01 | Sync, first | Establishes dependencies and configuration used by all other work |
| 02 | Async after 01 | Independent from prompt and provider implementation |
| 03 | Sync after 02 | Requires the completed access-control checks |
| 04 | Async after 01 | Independent managed-prompt module |
| 05 | Async after 01 | Independent provider contract and fake |
| 06 | Async after 05 | Uses only the provider contract |
| 07 | Async after 05 | Uses the fake provider and can run alongside 06 |
| 08 | Sync after 04 and 07 | Combines the prompt loader and ticket tool |
| 09 | Sync after 02, 04, and 08 | Integrates security, prompt loading, and the graph |
| 10 | Sync after 03 and 09 | Requires entitlement and create-ticket APIs |
| 11 | Sync, last | Verifies the completed end-to-end flow |

Recommended maximum parallel work:

```text
Phase 1: 01
Phase 2: 02 + 04 + 05
Phase 3: 03 + 06 + 07
Phase 4: 08
Phase 5: 09
Phase 6: 10
Phase 7: 11
```

## 6. Delivery order

1. Foundation: tickets 01-07.
2. Agent: ticket 08.
3. API: ticket 09.
4. Rollout routing: ticket 10.
5. Verification: ticket 11.

Each task should be a separate reviewable change where practical. Do not enable the route for real users until the API and production-guard tests are complete.
