import { createFileRoute } from '@tanstack/react-router'

import { getAuthenticatedUserHandler, getMemberCommandService } from '../../../../modules/composition.server'
import { createMemberInvitePostHandler } from '../../../../modules/members/server'

export const Route = createFileRoute('/api/lists/$listId/members')({
  server: { handlers: { POST: ({ request, params }) => createMemberInvitePostHandler({
    authenticatedUserHandler: getAuthenticatedUserHandler(), service: getMemberCommandService()
  })({ request, listId: params.listId }) } }
})
