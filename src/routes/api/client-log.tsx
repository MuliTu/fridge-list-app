import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'
import { sanitizeLogMessage } from '../../lib/sanitizeLogMessage'

// Forwards client-side action logs (grocery/stock/receipt/category/admin writes,
// see firebase.ts's logClientAction) into the server terminal, same as the
// scan-receipt/categorize-item routes already do for their own webhook calls —
// those run server-side already, but Firebase SDK writes happen in the browser, so
// without this hop their console.log output never reaches the terminal.
export const Route = createFileRoute('/api/client-log')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Fire-and-forget: never throw. `message` is caller-supplied and this route
        // is unauthenticated, so it must be sanitized (strip CR/LF, cap length)
        // before hitting the logger — otherwise an injected newline forges fake log
        // lines (log injection). A malformed/absent body is silently dropped (204).
        let message: unknown
        let level: unknown
        try {
          ({ message, level } = await request.json())
        } catch {
          return new Response(null, { status: 204 })
        }
        const safe = sanitizeLogMessage(message)
        if (safe === null) return new Response(null, { status: 204 })
        const log = level === 'error' ? logger.error : level === 'warn' ? logger.warn : logger.success
        log(safe)
        return new Response(null, { status: 204 })
      }
    }
  }
})
