import { createFileRoute } from '@tanstack/react-router'

import { getAuthenticatedUserHandler, getMemberCommandService } from '../../../../modules/composition.server'
import {
  createMemberInvitePostHandler,
  createMemberLeaveDeleteHandler,
  createMemberSummaryGetHandler
} from '../../../../modules/members/server'

const dependencies = () => ({
  authenticatedUserHandler: getAuthenticatedUserHandler(),
  service: getMemberCommandService()
})

export const memberCollectionHandlers = {
  GET: ({ request, params }: { request: Request; params: { listId: string } }) =>
    createMemberSummaryGetHandler(dependencies())({ request, listId: params.listId }),
  POST: ({ request, params }: { request: Request; params: { listId: string } }) =>
    createMemberInvitePostHandler(dependencies())({ request, listId: params.listId }),
  DELETE: ({ request, params }: { request: Request; params: { listId: string } }) =>
    createMemberLeaveDeleteHandler(dependencies())({ request, listId: params.listId })
}

export const Route = createFileRoute('/api/lists/$listId/members')({
  server: { handlers: memberCollectionHandlers }
})
