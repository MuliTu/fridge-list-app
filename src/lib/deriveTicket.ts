import type { FeedbackRecord } from '../types'

// Normalizes whatever n8n's "Build Card"/"Respond" node sends back into the clean
// { id, url, title } shape both the live submit flow (src/routes/api/submit-feedback.tsx)
// and the daily retry job (src/routes/api/retry-feedback.tsx, ticket F2) persist onto a
// FeedbackRecord (see src/types.ts). Extracted into its own module specifically so both
// call sites share one implementation instead of copy-pasting it — F2's design brief
// says to "mirror" submit-feedback.tsx's derivation logic exactly, and a shared function
// is the only way to guarantee that stays true as either route evolves, rather than two
// copies silently drifting apart.
//
// n8n's raw payload isn't confirmed live this session (the n8n MCP connector was
// unreachable when this was first written for submit-feedback.tsx) — this is a
// best-effort, documented assumption: `cardUrl` is already known-present (submit-
// feedback.tsx's own log line reads it directly), and `cardId`/`cardName` are assumed to
// sit alongside it on the same "Build Card" response per CLAUDE.md's Trello module docs.
// Falls back to the Trello node's own raw field names (`id`/`url`/`name`) in case n8n
// forwards those instead, and finally to `fallbackTitle` (the original request text) so
// a successful call is never left half-populated.
export const deriveTicketFromN8nResponse = (data: any, fallbackTitle: string): FeedbackRecord['ticket'] =>
  data?.cardUrl || data?.url
    ? {
        id: String(data.cardId || data.id || ''),
        url: String(data.cardUrl || data.url || ''),
        title: String(data.cardName || data.name || fallbackTitle)
      }
    : null
