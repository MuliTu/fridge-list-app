import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'

// Forwards client-side action logs (grocery/stock/receipt/category/admin writes,
// see firebase.ts's logClientAction) into the server terminal, same as the
// scan-receipt/categorize-item routes already do for their own webhook calls —
// those run server-side already, but Firebase SDK writes happen in the browser, so
// without this hop their console.log output never reaches the terminal.
export const Route = createFileRoute('/api/client-log')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { message, level } = await request.json()
        const log = level === 'error' ? logger.error : level === 'warn' ? logger.warn : logger.success
        log(message)
        return new Response(null, { status: 204 })
      }
    }
  }
})
