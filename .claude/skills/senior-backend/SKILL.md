---
name: "senior-backend"
description: "Apply senior/staff-level backend engineering judgment to fridge-list-app's server-side surface: the TanStack Start server routes (src/routes/api/*.tsx) and the n8n workflows they proxy to. Use whenever adding or reviewing a server route, an n8n workflow change, error handling, logging, or anything that crosses the client/server or app/n8n trust boundary — not just 'does the request succeed' but 'what does this do when Gemini is rate-limited, n8n is down, or the input is malformed.'"
---

fridge-list-app's backend surface is small and split two ways: TanStack Start server routes in `src/routes/api/*.tsx` (`scan-receipt`, `scan-receipt-url`, `categorize-item`, `client-log`), and n8n workflows on a separate instance. See `.claude/skills/n8n-groceries-workflow` and `.claude/skills/firebase-data-model` for the concrete schema/workflow reference — this skill is the judgment layer: what a senior backend engineer would insist on before calling a change here done.

## The proxy pattern exists for one specific reason — don't break it

Every server route that calls n8n (`scan-receipt.tsx`, `scan-receipt-url.tsx`, `categorize-item.tsx`) exists **only** to keep the n8n webhook URL out of the browser bundle — it's not secret in the "protect at all costs" sense, but a client-side `fetch` straight to n8n would ship that URL to every visitor regardless of repo visibility (this was a real finding from this project's own security review, see `CONVERSATION.md`). Before adding any new client-to-n8n integration: it goes through a new or existing server route, never a direct browser fetch. Same reasoning applies to any future third-party API key/URL — if it needs a credential, it belongs server-side.

## Logging discipline — reuse, don't reinvent

`src/lib/logger.ts` wraps `consola` with exactly three levels (`success`/`warn`/`error`, timestamped) — every server route already logs request-received, upstream-call-attempted, and upstream-response/failure through it. A new server route that adds `console.log` instead of using `logger` is a regression, not a stylistic choice — it breaks the consistent, greppable log format every other route already has.

Client-side writes (Firebase actions in `src/lib/firebase.ts`) forward through `logClientAction()` → `POST /api/client-log` → the same `logger`, specifically so a browser-side action still shows up in the terminal, not just the browser console (browser JS and the dev server are different processes; `console.log` in a component never reaches the terminal on its own). If you add a new client-side mutation, log it the same way the existing ones do (`logClientAction('[module] actionName: details')`) — don't add a bespoke client-only `console.log`.

## Error handling: what actually happens when the dependency fails

The single most concrete lesson from this codebase's real incident history: a Gemini node in the "Receipt Scanner (Hebrew)" n8n workflow had no error handling, so any Gemini failure (quota exhaustion, transient error) killed the whole execution *before* the "Respond to Webhook" node ever ran — n8n's fallback behavior was to send back an **empty 200 body**, which made the app's `response.json()` throw `Unexpected end of JSON input`, several layers away from the actual cause. The fix was `onError: "continueErrorOutput"` wired into a node that returns a real `{ error: true, message, detail }` payload — the general principle: every node/route that calls an external AI/API must have an explicit answer to "what does the caller receive if this specific step fails," not just "what happens on success." A silent/empty/malformed response on failure is a bug even if the failure itself is expected and rare.

When diagnosing a "the app got a weird error" report, verify against the actual execution, don't guess from reading code — `n8n_executions` (mode: `error`) gives the real upstream error (in one real case, a 429 with `quotaDimensions.model` in the payload, which is what revealed the quota was tracked *per-model*, not per-project — that fact directly shaped the fix, a fallback model). Reading the workflow JSON alone would not have surfaced that.

## Input validation at trust boundaries

`scan-receipt-url.tsx` validates its input (`if (!url || typeof url !== 'string') return 400`) before doing anything with it; other routes are looser (`categorize-item.tsx` forwards `body.text` without checking it's a string). A server route is a trust boundary — the browser request body is not guaranteed to match what the client code intends to send (bugs, direct curl, future callers). Match the stricter existing example rather than the looser one when adding a new route; don't newly introduce a route with zero shape-checking on its request body just because a neighboring route already has that gap.

## Graceful degradation is the house style — preserve it

Every AI-dependent path in this app (receipt OCR, receipt-from-URL, item categorization) is designed so failure degrades to a manual fallback rather than a dead end: a failed scan still opens the review modal empty for manual entry; a failed categorization still adds the raw typed item under `OTHER_CATEGORY_NAME` instead of dropping it. Any new AI-backed feature needs the same shape: define the manual/default fallback path *before* wiring the happy path, not as an afterthought once something breaks in production.

## Idempotency and concurrency

The Siri workflow's insert/update/skip logic (checked against current `/groceries` state before writing) is the existing idempotency pattern for anything that reacts to repeated/duplicate input — read it before adding a new write path that could plausibly fire twice for the same logical action (e.g. a retried webhook, a double-tapped button). Quantity adjustments (`adjustStockQuantity`, `bought` toggles) are explicitly *not* transactional here (last-write-wins is an accepted tradeoff for a small household app) — don't add optimistic-locking complexity to those paths unprompted; that tradeoff was a deliberate decision, not an oversight.

## Rate limits and fallbacks for external AI calls

Gemini's free tier is shared across every workflow using the same credential (Siri, receipt scan, receipt-URL scan, categorization) and is capped per day *per model*. Two concrete consequences for any new AI-backed n8n step: batch requests instead of one-per-item where possible (a receipt-reconcile batch categorization call was rewritten from N calls to 1 for exactly this reason), and consider a same-credential fallback to a second model on `continueErrorOutput` before assuming a paid tier or a second provider is needed — per-model quota separation is a real, already-exploited escape hatch here, not a hypothetical.
