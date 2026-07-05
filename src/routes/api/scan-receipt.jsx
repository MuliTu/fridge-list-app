import { createFileRoute } from '@tanstack/react-router'

const RECEIPT_SCAN_URL = 'https://whiny-idealist-unseen.ngrok-free.dev/webhook/receipt-scan'

export const Route = createFileRoute('/api/scan-receipt')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        try {
          const upstream = await fetch(RECEIPT_SCAN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          })
          const data = await upstream.json()
          return Response.json(data, { status: upstream.status })
        } catch (err) {
          console.error('[scan-receipt] upstream call failed:', err.message)
          return Response.json({ error: true, message: 'receipt scan upstream failed' }, { status: 502 })
        }
      }
    }
  }
})
