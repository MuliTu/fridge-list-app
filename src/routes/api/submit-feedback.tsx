import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'
import { verifyAuthToken } from '../../lib/verifyAuthToken'

// Same server-side-URL-hiding pattern as the receipt/categorize routes: the n8n
// webhook URL lives only here, never in the client bundle. The browser POSTs to
// this same-origin route, which forwards the feedback payload to n8n, where Gemini
// structures it into a ticket and a Trello card is created.
const SUBMIT_FEEDBACK_URL = 'https://whiny-idealist-unseen.ngrok-free.dev/webhook/feedback'

export const Route = createFileRoute('/api/submit-feedback')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Without this, anyone on the internet could hit this route directly and
        // create arbitrary Trello cards on the product board (each submission also
        // burns a Gemini call, see security-2). Already canEdit/sign-in-gated in the
        // UI; enforce it server-side too.
        const authResult = await verifyAuthToken(request)
        if (!authResult.ok) {
          logger.warn(`[submit-feedback] request rejected: unauthorized (${authResult.reason})`)
          return Response.json({ error: true, message: 'unauthorized' }, { status: 401 })
        }

        const body = await request.json()

        // A non-empty request is the one hard requirement — everything else is
        // auto-populated metadata the client fills in and is fine to be absent.
        const requestText = typeof body?.request === 'string' ? body.request.trim() : ''
        if (!requestText) {
          logger.warn('[submit-feedback] rejected: empty request')
          return Response.json({ error: true, message: 'empty_request' }, { status: 400 })
        }

        logger.success(
          `[submit-feedback] request received: from=${body.name || 'unknown'} lang=${body.language || '?'} route=${body.route || '?'}`
        )

        try {
          logger.success('[submit-feedback] forwarding to n8n webhook...')
          const upstream = await fetch(SUBMIT_FEEDBACK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, request: requestText })
          })
          const data = await upstream.json().catch(() => ({}))
          if (!upstream.ok || data.error) {
            logger.warn(`[submit-feedback] upstream returned an error: status=${upstream.status}`)
            return Response.json(
              { error: true, message: data.message || 'feedback upstream failed' },
              { status: upstream.status && upstream.status >= 400 ? upstream.status : 502 }
            )
          }
          logger.success(`[submit-feedback] upstream ok: card=${data.cardUrl || 'created'}`)

          // Normalize whatever n8n's "Respond" node sends into a clean { id, url, title }
          // shape the client can persist onto its own FeedbackRecord (see F1 ticket /
          // src/types.ts). n8n's raw payload isn't confirmed live this session (the
          // n8n MCP connector returned 404/unreachable when checked) — this is a
          // best-effort, documented assumption: `cardUrl` is already known-present
          // (see the log line above, which predates this change and reads it directly),
          // and `cardId`/`cardName` are assumed to sit alongside it on the same "Build
          // Card" response per CLAUDE.md's Trello module docs. Falls back to the Trello
          // node's own raw field names (`id`/`url`/`name`) in case n8n forwards those
          // instead, and finally to the original request text for `title` so this is
          // never left half-populated. `data` itself is still spread through unchanged
          // underneath, so nothing that already reads `data.cardUrl` breaks.
          const ticket =
            data.cardUrl || data.url
              ? {
                  id: String(data.cardId || data.id || ''),
                  url: String(data.cardUrl || data.url || ''),
                  title: String(data.cardName || data.name || requestText)
                }
              : null
          return Response.json({ ...data, ticket }, { status: 200 })
        } catch (err: any) {
          logger.error(`[submit-feedback] upstream call failed: ${err.message}`)
          return Response.json({ error: true, message: 'feedback upstream failed' }, { status: 502 })
        }
      }
    }
  }
})
