# Spec: LangGraph Create-Ticket Agent

Status: Draft (non-production)
Language: TypeScript
API route: `POST /api/agent/create-ticket`

## 1. Goal

Add a server-side LangGraph agent that accepts a natural-language product request, turns it into a structured ticket, and creates the ticket through a dedicated ticket-creation tool.

The initial version is a protected, non-production rollout for multiple explicitly granted users. Its system prompt is managed in LangChain administration and fetched server-side at runtime. Users who are not granted access must continue through the existing n8n feedback process.

## 2. Scope

### In scope

- A TypeScript LangGraph agent.
- A new authenticated `POST /api/agent/create-ticket` API.
- Server-side request validation.
- A system prompt fetched from LangChain administration by a configured prompt identifier.
- A server-side allowlist supporting multiple granted users.
- Routing granted users to the new agent flow while all other users remain on the current n8n flow.
- A hard production guard that prevents this route from running.
- One agent tool for creating a ticket.
- Structured success and error responses.
- Unit tests for validation, authentication, agent behavior, and tool failures.
- Logging that excludes secrets and full prompt contents.

### Out of scope

- Editing or publishing prompts from this application.
- Conversation memory or multi-turn sessions.
- Streaming responses.
- Human approval before ticket creation.
- Updating, deleting, or searching tickets.
- Production secret provisioning.

## 3. Assumptions

- The route follows this repository's TanStack Start convention, so the requested `agent/create-ticket` API is exposed as `/api/agent/create-ticket`.
- Requests use the existing Firebase bearer-token authentication implemented by `verifyAuthToken`.
- Access is granted per authenticated Firebase user. The stable Firebase `uid` is the preferred allowlist key; email may be supported only as a temporary migration aid.
- The first ticket provider is Trello, matching the application's current feedback flow. Provider-specific code must remain isolated so it can be replaced later.
- One accepted API request may create at most one ticket.
- The existing `/api/submit-feedback` endpoint and n8n workflow remain unchanged.
- The client decides which flow to call based on an authoritative access result. The new route also enforces the same access rules server-side.

## 4. Proposed file layout

```text
src/
  agents/
    createTicketAgent.ts
    createTicketGraph.ts
    createTicketSchemas.ts
    tools/
      createTicketTool.ts
      trelloTicketProvider.ts
  routes/
    api/
      agent/
        create-ticket.tsx
        create-ticket.test.ts
```

The exact split may be reduced during implementation if a file becomes trivial, but the API, graph, and external-provider responsibilities must stay separate.

## 5. API contract

### Request

```http
POST /api/agent/create-ticket
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

```json
{
  "request": "Add a way to share a shopping list with another household member",
  "context": {
    "route": "/",
    "language": "en",
    "appVersion": "2.40.0"
  }
}
```

Fields:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `request` | string | yes | Trimmed, 1-10,000 characters |
| `context` | object | no | Optional metadata to help the agent |
| `context.route` | string | no | Maximum 500 characters |
| `context.language` | string | no | Maximum 20 characters |
| `context.appVersion` | string | no | Maximum 50 characters |

Unknown fields should be ignored. Client-provided data must be treated as untrusted content, not instructions that can override the system prompt.

### Successful response

Status: `201 Created`

```json
{
  "success": true,
  "ticket": {
    "id": "provider-ticket-id",
    "url": "https://trello.com/c/example",
    "title": "Support shared shopping lists",
    "description": "..."
  },
  "runId": "uuid"
}
```

### Error response

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "request is required"
  },
  "runId": "uuid"
}
```

Expected statuses:

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `INVALID_JSON` | Request body is not valid JSON |
| `400` | `INVALID_REQUEST` | Body fails validation |
| `401` | `UNAUTHORIZED` | Firebase token is missing or invalid |
| `403` | `ACCESS_DENIED` | User is authenticated but is not granted access |
| `404` | `NOT_AVAILABLE` | Route is disabled in the current environment, including production |
| `500` | `SERVER_NOT_CONFIGURED` | Required server environment is missing |
| `502` | `PROMPT_PROVIDER_ERROR` | The managed prompt could not be retrieved or parsed |
| `502` | `MODEL_ERROR` | Model invocation failed |
| `502` | `TICKET_PROVIDER_ERROR` | Ticket provider rejected or failed the request |
| `500` | `AGENT_ERROR` | Unexpected graph failure |

Internal exception messages, model output, credentials, and system prompts must not be returned.

## 6. Agent design

Use `@langchain/langgraph` with a small, bounded graph:

```text
START
  -> prepare input
  -> model
  -> create_ticket tool (only when requested by the model)
  -> model finalization
  -> END
```

Agent requirements:

- Load the system prompt server-side from LangChain administration using the configured prompt identifier.
- Pin a prompt version or commit for repeatable testing when the administration service supports it; do not silently switch prompt content during an active deployment.
- Cache the fetched prompt for a short, configurable period if needed, without persisting it to client-visible storage.
- Fail closed if the prompt cannot be fetched or does not resolve to the expected chat/system-prompt format.
- Make the `create_ticket` tool the only mutating tool available to the graph.
- Require structured ticket arguments:
  - `title`: 1-120 characters.
  - `description`: 1-10,000 characters.
  - `labels`: optional string array, with a small configured limit.
  - `priority`: optional enum: `low`, `medium`, `high`.
- Set a recursion/step limit so the agent cannot loop indefinitely.
- Fail the run if the graph finishes without creating a ticket.
- Reject a second tool invocation in the same run.
- Return only the normalized result from the trusted tool, not arbitrary model-generated ticket IDs or URLs.
- Do not enable persistent checkpoints or cross-request memory in v1.

The graph state should track:

```ts
interface CreateTicketState {
  messages: BaseMessage[]
  ticketCreated: boolean
  ticket?: CreatedTicket
  runId: string
}
```

## 7. Ticket tool

Tool name: `create_ticket`

Input:

```ts
interface CreateTicketInput {
  title: string
  description: string
  labels?: string[]
  priority?: 'low' | 'medium' | 'high'
}
```

Output:

```ts
interface CreatedTicket {
  id: string
  url: string
  title: string
  description: string
}
```

The tool must:

- Validate its input independently of the model.
- Create one card through the configured provider.
- Apply a request timeout.
- Treat non-2xx responses and malformed provider responses as failures.
- Never log provider credentials.
- Be injectable or mockable in tests.

For Trello, provider configuration is read from server-only environment variables:

```dotenv
TRELLO_API_KEY=
TRELLO_API_TOKEN=
TRELLO_LIST_ID=
```

If the ticket provider is not yet ready, local development may use an explicitly enabled fake provider:

```dotenv
AGENT_CREATE_TICKET_PROVIDER=fake
```

The fake provider must not be the production default.

## 8. Access control, prompt management, and local environment

Suggested `.env.local` entries:

```dotenv
# Local testing only. Keep this file uncommitted.
AGENT_CREATE_TICKET_ENABLED=true
AGENT_CREATE_TICKET_ALLOWED_UIDS="firebase-uid-1,firebase-uid-2,dev-bypass"
AGENT_CREATE_TICKET_MODEL=
AGENT_CREATE_TICKET_PROVIDER=fake

# Managed prompt configuration from LangChain administration.
LANGCHAIN_API_KEY=
AGENT_CREATE_TICKET_PROMPT_ID=
AGENT_CREATE_TICKET_PROMPT_VERSION=

# Add the credential required by the selected chat-model adapter.
OPENAI_API_KEY=
```

Implementation requirements:

- `AGENT_CREATE_TICKET_ENABLED` must be explicitly `true`; missing or false means the route is unavailable.
- The route must always return `404 NOT_AVAILABLE` when `NODE_ENV === "production"`, even if the enable flag is accidentally set.
- Parse `AGENT_CREATE_TICKET_ALLOWED_UIDS` as a trimmed, comma-separated set. An empty allowlist grants access to nobody.
- Authenticate first, then compare the verified Firebase `uid` against the allowlist. Never trust a UID or email supplied in the request body.
- For this repository's existing local auth bypass, access is granted only when the allowlist explicitly contains its verified placeholder UID, `dev-bypass`.
- Support multiple granted users without sharing agent state or conversation history between them.
- The UI must use the same entitlement source to choose the flow:
  - granted user → `POST /api/agent/create-ticket`;
  - all other users → existing `POST /api/submit-feedback` → n8n.
- A `403` from the new route may cause the client to use the existing n8n flow only when no ticket was created. The server must never create a ticket and then fall back.
- The system prompt content must not be stored in `.env.local`; only its LangChain prompt identifier and optional pinned version belong there.
- Fetch the prompt with server-only LangChain credentials. Do not expose the credential, prompt content, or management metadata to the browser.
- The model name must be configurable through `AGENT_CREATE_TICKET_MODEL`.
- The implementation must fail closed with `SERVER_NOT_CONFIGURED` when the prompt identifier, LangChain credential, model, model credential, allowlist configuration, or selected provider configuration is absent.
- No `VITE_` prefix may be used for these values because that can expose them to client code.
- Add placeholder keys, never secrets, to `.env.example` if that file is introduced.
- Confirm `.env.local` is ignored before adding local secrets.

The chosen LangChain model adapter should be added as a direct dependency alongside:

- `@langchain/core`
- `@langchain/langgraph`
- a schema validator such as `zod`

## 9. Route behavior

The route handler must execute in this order:

1. Generate a `runId`.
2. Reject the request with `404 NOT_AVAILABLE` unless the feature is explicitly enabled and the runtime is non-production.
3. Verify the Firebase bearer token with `verifyAuthToken`.
4. Verify the authenticated Firebase `uid` is in the server-side allowlist; otherwise return `403 ACCESS_DENIED`.
5. Parse JSON safely.
6. Validate and normalize the request.
7. Check required server configuration.
8. Fetch the pinned system prompt from LangChain administration.
9. Invoke the graph with the user request and optional context.
10. Confirm that the trusted tool created exactly one ticket.
11. Return `201` with the normalized ticket.
12. Map known failures to the error contract; log unexpected failures with `runId`.

The route must not forward the Firebase token to the model or ticket provider.

## 10. Security and operational requirements

- Keep the agent, model call, prompt, and ticket credentials server-side.
- Require authentication and allowlist authorization for every invocation.
- Keep the new route unavailable in production until this restriction is deliberately removed in a future change.
- Do not expose allowlist membership as public client configuration. If the UI needs an entitlement check, return only the authenticated user's boolean entitlement from a protected server endpoint.
- Apply a request-body size limit where supported.
- Treat the user's request and context as data delimited from system instructions.
- Add timeouts to both model and provider requests.
- Cap agent steps and tool calls.
- Avoid logging the full request because it may contain personal data.
- Log `runId`, authenticated user ID when available, duration, outcome, and safe provider ticket ID.
- Consider per-user rate limiting before production rollout.
- Do not retry ticket creation automatically unless the provider supports an idempotency key; blind retries can create duplicate tickets.

## 11. Tests

Minimum automated coverage:

- Rejects a missing or invalid bearer token with `401`.
- Returns `403` for an authenticated user who is not on the allowlist and never invokes the model or ticket tool.
- Allows each configured UID and keeps graph state isolated between users.
- Returns `404` when the feature flag is disabled.
- Returns `404` in production even when the feature flag is enabled.
- Rejects invalid JSON.
- Rejects an empty, non-string, or oversized `request`.
- Returns `500` when required environment configuration is missing.
- Fetches the configured, pinned LangChain prompt and passes it to the model without exposing it in the response.
- Maps prompt retrieval and parsing failures to `PROMPT_PROVIDER_ERROR`.
- Creates one ticket for a valid request and returns `201`.
- Never creates more than one ticket per run.
- Rejects or fails a graph run that does not call `create_ticket`.
- Maps model failures to `MODEL_ERROR`.
- Maps provider failures to `TICKET_PROVIDER_ERROR`.
- Does not leak prompt text, API keys, tokens, or raw exceptions.
- Fake-provider integration test runs without external network access.

## 12. Acceptance criteria

- `POST /api/agent/create-ticket` exists and follows the documented contract.
- The endpoint is inaccessible without valid Firebase authentication and explicit UID-based access.
- Multiple granted users can use the endpoint without sharing state.
- Non-granted users continue through the existing n8n flow; that workflow remains operational and unchanged.
- The new route returns `404` in production and cannot invoke the model or create tickets there.
- The agent and graph are implemented in TypeScript with LangGraph.
- The system prompt is fetched server-side from LangChain administration using a configured prompt ID and pinned version; prompt content is neither hard-coded nor stored in `.env.local`.
- A valid request creates exactly one ticket through the tool abstraction.
- The fake provider supports deterministic local testing.
- Configuration, validation, model, and provider failures return the documented safe errors.
- Unit tests pass and the existing project test/build commands remain green.

## 13. Open decisions before production

- Confirm Trello as the long-term ticket provider.
- Choose the production model and its timeout/token budget.
- Define the production prompt promotion/versioning process in LangChain administration.
- Replace the temporary allowlist with the long-term authorization/feature-flag mechanism.
- Explicitly approve removal of the production guard; production use is not part of this spec.
- Decide whether users should preview and approve a ticket before creation.
- Define rate limits and observability/retention rules.
- Decide whether production calls require idempotency and how its key is stored.
