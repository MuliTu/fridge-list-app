import { createFileRoute } from '@tanstack/react-router'

import { getAuthenticatedUserHandler, getMemberCommandService } from '../../../../../modules/composition.server'
import {
  createMemberInviteDeleteHandler,
  createMemberLanguagePatchHandler
} from '../../../../../modules/members/server'

const dependencies = () => ({
  authenticatedUserHandler: getAuthenticatedUserHandler(),
  service: getMemberCommandService()
})

export const memberResourceHandlers = {
  DELETE: ({ request, params }: { request: Request; params: { listId: string; email: string } }) =>
    createMemberInviteDeleteHandler(dependencies())({
      request,
      listId: params.listId,
      email: params.email
    }),
  PATCH: ({ request, params }: { request: Request; params: { listId: string; email: string } }) =>
    createMemberLanguagePatchHandler(dependencies())({
      request,
      listId: params.listId,
      email: params.email
    })
}

export const Route = createFileRoute('/api/lists/$listId/members/$email')({
  server: { handlers: memberResourceHandlers }
})
