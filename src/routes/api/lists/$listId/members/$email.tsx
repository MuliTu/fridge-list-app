import { createFileRoute } from '@tanstack/react-router'

import { getAuthenticatedUserHandler, getMemberCommandService } from '../../../../../modules/composition.server'
import { createMemberInviteDeleteHandler } from '../../../../../modules/members/server'

export const Route = createFileRoute('/api/lists/$listId/members/$email')({
  server: { handlers: { DELETE: ({ request, params }) => createMemberInviteDeleteHandler({
    authenticatedUserHandler: getAuthenticatedUserHandler(), service: getMemberCommandService()
  })({ request, listId: params.listId, email: params.email }) } }
})
