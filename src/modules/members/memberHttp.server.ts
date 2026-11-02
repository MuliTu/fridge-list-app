import '@tanstack/react-start/server-only'

import type { AuthenticatedUserHandler } from '../identity/server'
import { parseJsonRequest } from '../identity/server'
import type { MemberCommandService } from './memberCommands.service'

type Dependencies = { authenticatedUserHandler: AuthenticatedUserHandler; service: MemberCommandService }
const empty = () => new Response(null, { status: 204 })

export const createMemberInvitePostHandler = (dependencies: Dependencies) =>
  ({ request, listId }: { request: Request; listId: string }) =>
    dependencies.authenticatedUserHandler.handle(request, parseJsonRequest, async (context, input) => {
      await dependencies.service.invite(context, listId, input)
      return empty()
    })

export const createMemberInviteDeleteHandler = (dependencies: Dependencies) =>
  ({ request, listId, email }: { request: Request; listId: string; email: string }) =>
    dependencies.authenticatedUserHandler.handle(request, () => undefined, async (context) => {
      await dependencies.service.remove(context, listId, decodeURIComponent(email))
      return empty()
    })
