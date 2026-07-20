import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'
import { verifyAuthToken } from '../../lib/verifyAuthToken'

// NOT YET BUILT/VERIFIED ON THE N8N SIDE — see the P3 ticket's PR description. This
// follows the exact same URL/credential shape as every other n8n proxy route in this
// app (categorize-item.tsx, scan-receipt.tsx, submit-feedback.tsx): same ngrok host,
// same `/webhook/<path>` convention, no separate credential of its own expected (same
// shared Gemini credential the other workflows use). Whoever builds the actual n8n
// workflow ("Purchase Habit Summary (Hebrew/English)" or similar) should point it at
// this exact path.
const PURCHASE_HABIT_SUMMARY_URL = 'https://whiny-idealist-unseen.ngrok-free.dev/webhook/purchase-habit-summary'

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
      POST: async ({ request }) => {
        // Same reasoning as categorize-item.tsx: this forwards to the shared Gemini
        // free-tier quota, so an anonymous caller could exhaust it. Gated the same way
        // as every other n8n-proxying route.
        const authResult = await verifyAuthToken(request)
        if (!authResult.ok) {
          logger.warn(`[purchase-habit-summary] request rejected: unauthorized (${authResult.reason})`)
          return Response.json({ error: true, message: 'unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const changes = Array.isArray(body?.changes) ? body.changes : []

        // Nothing to summarize — don't even call out to n8n/Gemini for an empty list,
        // same "don't burn the shared quota for no reason" judgment already applied
        // elsewhere (e.g. the client only calls this route when computeHabitChanges
        // actually found something, see usePurchaseHabitSummary.ts).
        if (changes.length === 0) {
          logger.success('[purchase-habit-summary] no changes to summarize, skipping n8n call')
          return Response.json({ summary: [] })
        }

        logger.success(`[purchase-habit-summary] request received: ${changes.length} change(s)`)
        try {
          logger.success('[purchase-habit-summary] forwarding to n8n webhook...')
          const upstream = await fetch(PURCHASE_HABIT_SUMMARY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ changes })
          })
          const data = await upstream.json()
          if (!data.summary || data.summary.length === 0) {
            logger.warn(`[purchase-habit-summary] upstream returned no summary: status=${upstream.status}`)
          } else {
            logger.success(`[purchase-habit-summary] upstream responded: status=${upstream.status}, sentences=${data.summary.length}`)
          }
          return Response.json(data, { status: upstream.status })
        } catch (err: any) {
          logger.error(`[purchase-habit-summary] upstream call failed: ${err.message}`)
          return Response.json({ error: true, message: 'purchase habit summary upstream failed' }, { status: 502 })
        }
      }
    }
  }
})
