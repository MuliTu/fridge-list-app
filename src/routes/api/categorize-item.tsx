import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'

const CATEGORIZE_ITEM_URL = 'https://whiny-idealist-unseen.ngrok-free.dev/webhook/categorize-item'

export const Route = createFileRoute('/api/categorize-item')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        logger.success(`[categorize-item] request received: text="${body.text}"`)
        try {
          logger.success('[categorize-item] forwarding to n8n webhook...')
          const upstream = await fetch(CATEGORIZE_ITEM_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          })
          const data = await upstream.json()
          if (!data.items || data.items.length === 0) {
            logger.warn(`[categorize-item] upstream returned no items: status=${upstream.status}`)
          } else {
            logger.success(`[categorize-item] upstream responded: status=${upstream.status}, items=${data.items.length}`)
          }
          return Response.json(data, { status: upstream.status })
        } catch (err) {
          logger.error(`[categorize-item] upstream call failed: ${err.message}`)
          return Response.json({ error: true, message: 'categorize item upstream failed' }, { status: 502 })
        }
      }
    }
  }
})
