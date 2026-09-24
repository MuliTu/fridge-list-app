import { createFileRoute } from '@tanstack/react-router'
import { createPurchaseHabitSummaryHandler } from '../../modules/purchaseHabitSummary/server'

// Forwards a small, already-aggregated list of detected habit changes (see
// computeHabitChanges in src/lib/purchaseHabitChanges.ts) to n8n, which is expected to
// run them through Gemini and come back with 1-3 short, plain-language sentences a
// non-technical household member would understand (e.g. "You've been buying a lot
// more coffee lately") — never a technical diff dump, and never anything
// forecast/prediction-shaped (that's explicitly out of scope for this feature, same
// "detect real past-vs-present changes only" boundary as computeHabitChanges itself).
//
// Deliberately takes the already-reduced `changes` list, not raw purchase-history
// events — same "n8n extracts/summarizes, the app does the aggregation and stays
// thin" split already used by categorize-item.tsx and submit-feedback.tsx, and it
// keeps a user's full purchase history from ever leaving the browser unnecessarily.
//
// Request/response contract (for whoever builds the n8n workflow):
//   POST body:  { changes: HabitChange[] }
//     where each HabitChange is:
//       { itemName: string, direction: 'increase' | 'decrease',
//         window: 'weekly' | 'monthly', recentCount: number, priorCount: number }
//   Response (200): { summary: string[] }   — 1-3 plain-language sentences, no
//     markdown, no per-item technical detail, not translated (this is Gemini-
//     generated dynamic content, same "freeform dynamic content isn't run through
//     i18n" precedent as category/list names and item notes elsewhere in this app).
//   Response (4xx/5xx or empty changes): n8n should still respond 200 with
//     { summary: [] } if it has nothing to say — the client treats an empty array as
//     "no summary available" rather than an error, same graceful-degradation pattern
//     as Receipt Scanner's quota fallback.
export const Route = createFileRoute('/api/purchase-habit-summary')({
  server: {
    handlers: {
      POST: createPurchaseHabitSummaryHandler()
    }
  }
})
