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
// Supports both the normalized n8n fields (`cardUrl`, `cardId`, `cardName`) and the
// ticket provider's raw field names (`id`, `url`, `name`) so a successful call is never
// left half-populated.
export const deriveTicketFromN8nResponse = (data: any, fallbackTitle: string): FeedbackRecord['ticket'] =>
  data?.cardUrl || data?.url
    ? {
        id: String(data.cardId || data.id || ''),
        url: String(data.cardUrl || data.url || ''),
        title: String(data.cardName || data.name || fallbackTitle)
      }
    : null
