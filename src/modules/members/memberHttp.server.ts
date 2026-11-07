import '@tanstack/react-start/server-only'

import type { AuthenticatedUserHandler } from '../identity/server'
import { parseJsonRequest } from '../identity/server'
import type { MemberCommandService } from './memberCommands.service'

type Dependencies = { authenticatedUserHandler: AuthenticatedUserHandler; service: MemberCommandService }
const empty = () => new Response(null, { status: 204 })
const json = (value: unknown) => Response.json(value)

export const createMemberSummaryGetHandler = (dependencies: Dependencies) =>
  ({ request, listId }: { request: Request; listId: string }) =>
    dependencies.authenticatedUserHandler.handle(request, () => undefined, async (context) =>
      json(await dependencies.service.getSummary(context, listId)))

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

export const createMemberLanguagePatchHandler = (dependencies: Dependencies) =>
  ({ request, listId, email }: { request: Request; listId: string; email: string }) =>
    dependencies.authenticatedUserHandler.handle(request, parseJsonRequest, async (context, input) => {
      await dependencies.service.updateNotificationLanguage(
        context,
        listId,
        decodeURIComponent(email),
        input
      )
      return empty()
    })

export const createMemberLeaveDeleteHandler = (dependencies: Dependencies) =>
  ({ request, listId }: { request: Request; listId: string }) =>
    dependencies.authenticatedUserHandler.handle(request, () => undefined, async (context) => {
      await dependencies.service.leave(context, listId)
      return empty()
    })
