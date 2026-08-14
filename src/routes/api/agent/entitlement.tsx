import { createFileRoute } from '@tanstack/react-router'
import { getTicketingServer } from '../../../modules/composition.server'

const json = (body: unknown, status: number): Response =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store'
    }
  })

export const Route = createFileRoute('/api/agent/entitlement')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const decision = await getTicketingServer().decideCreateTicketAccess(request)

        if (decision.ok) {
          return json({ entitled: true }, 200)
        }

        // An allowlist miss is an authoritative, non-sensitive entitlement
        // result. Do not expose the UID, allowlist, or reason for the miss.
        if (decision.status === 403) {
          return json({ entitled: false }, 200)
        }

        return json(
          {
            error: {
              code: decision.code,
              message: decision.message
            }
          },
          decision.status
        )
      }
    }
  }
})
