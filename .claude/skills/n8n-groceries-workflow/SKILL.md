---
name: "n8n-groceries-workflow"
description: "Inspect, edit, validate, or test one of this project's n8n workflows (Siri groceries, receipt photo scanner, receipt URL parser, item categorizer) running on the connected n8n instance. Use when a change is needed to voice-to-list extraction, receipt parsing, or category logic on the n8n side rather than in the React app."
---

fridge-list-app's voice/receipt intelligence lives in n8n, not in this repo. The n8n-mcp tools are connected to the **live** instance — use them directly, don't just describe changes for the user to make by hand.

## Known workflows

| Workflow | id | Webhook path | Purpose |
|---|---|---|---|
| Siri → Groceries List (Hebrew) | `xa3vWIimtG37EPKM` | `siri-groceries` | Extracts + categorizes items from Hebrew dictation, dedups/reactivates against `/groceries` |
| Receipt Scanner (Hebrew) | `hqbxddY1YfH9r5FK` | `receipt-scan` | Gemini vision OCR on a receipt photo → `{store_name, items, total}` |
| Receipt URL Parser (Hebrew) | `oWm6trBDl06KHM1N` | `receipt-url-scan` | Same extraction, from scraped page text instead of a photo |
| Categorize Grocery Item (Hebrew) | (see n8n instance) | `categorize-item` | Categorizes a manually-typed item, no Firebase writes |

n8n instance: `https://whiny-idealist-unseen.ngrok-free.dev` (ngrok tunnel — URL is not stable across tunnel restarts, a known gap).

## Before changing a workflow

1. `n8n_get_workflow` the relevant id above to see its current state — don't assume the docs in `CLAUDE.md` are still 100% current, confirm against the live workflow.
2. Identify which node needs the change (Gemini prompt, Code node parsing logic, Switch routing, etc).

## Gotchas specific to this n8n instance

- Inside Code nodes, use `this.helpers.httpRequest(...)`, **not** `$helpers.httpRequest(...)` — the latter throws `$helpers is not defined` on this instance.
- An HTTP Request node's `method` field cannot be set via an expression (`={{ ... }}`) on this node version — use a Switch/Route node to pick between fixed-method HTTP Request nodes instead.
- The Siri and "Categorize Grocery Item" workflows each hardcode their own copy of the category list (in the Gemini prompt and in a `VALID_CATEGORIES` array) — they do **not** read `/categories` live from Firebase. If you change categories in the app, remember this is a known gap: it has no effect on n8n until both workflows are rewired to fetch `/categories` first.

## After changing a workflow

1. `n8n_validate_workflow` to catch structural issues.
2. `n8n_test_workflow` (or trigger the real webhook) to confirm end-to-end behavior before considering it done.
3. If you need to inspect live Firebase data to confirm a workflow's effect, spin up a disposable workflow (Webhook → HTTP Request GET `.../groceries.json` → Respond to Webhook) and **delete it when done** — don't leave debug workflows active.

## What n8n never does

Nothing here writes to `/stock` or `/receipts` — those are only touched by the web app itself, after the user reviews/confirms. Don't add Firebase writes to the receipt-scanning workflows; they only extract and respond.
