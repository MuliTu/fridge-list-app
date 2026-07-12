import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'
import { verifyAuthToken } from '../../lib/verifyAuthToken'

const RECEIPT_SCAN_URL = 'https://whiny-idealist-unseen.ngrok-free.dev/webhook/receipt-scan'

export const Route = createFileRoute('/api/scan-receipt')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // This route is called directly from the browser (see the security note in
        // CLAUDE.md's Receipt scanning section on why it's proxied at all) and forwards
        // to n8n -> Gemini, which shares a 20-req/day free-tier quota across every
        // workflow — an unauthenticated caller could exhaust that in seconds. The UI
        // already gates this behind canEdit/sign-in; this enforces it server-side too.
        const authResult = await verifyAuthToken(request)
        if (!authResult.ok) {
          logger.warn(`[scan-receipt] request rejected: unauthorized (${authResult.reason})`)
          return Response.json({ error: true, message: 'unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const base64Length = body.image_base64 ? body.image_base64.length : 0
        logger.success(`[scan-receipt] request received: mime_type=${body.mime_type}, base64_length=${base64Length}`)
        try {
          logger.success('[scan-receipt] forwarding to n8n webhook...')
          const upstream = await fetch(RECEIPT_SCAN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          })
          const data = await upstream.json()
          if (data.error) {
            logger.warn(`[scan-receipt] upstream responded with error: status=${upstream.status}`)
          } else {
            logger.success(`[scan-receipt] upstream responded: status=${upstream.status}`)
          }
          return Response.json(data, { status: upstream.status })
        } catch (err) {
          logger.error(`[scan-receipt] upstream call failed: ${err.message}`)
          return Response.json({ error: true, message: 'receipt scan upstream failed' }, { status: 502 })
        }
      }
    }
  }
})
