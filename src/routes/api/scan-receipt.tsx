import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'

const RECEIPT_SCAN_URL = 'https://whiny-idealist-unseen.ngrok-free.dev/webhook/receipt-scan'

export const Route = createFileRoute('/api/scan-receipt')({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
