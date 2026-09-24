import { createFileRoute } from '@tanstack/react-router'
import { createSendInvitationEmailHandler } from '../../modules/invitations/server'

// This route is currently unauthenticated. SMTP is optional and disabled unless the
// required environment variables are configured, but the route should be admin-gated
// before enabling real invitation delivery in production.

export const Route = createFileRoute('/api/send-invite-email')({
  server: {
    handlers: {
      POST: createSendInvitationEmailHandler()
    }
  }
})
