import '@tanstack/react-start/server-only'

import type { AuthenticatedUserHandler } from '../../identity/server'
import type { ListDeletionService } from '../application/listDeletion.service'

type Dependencies = {
  authenticatedUserHandler: AuthenticatedUserHandler
  service: ListDeletionService
}

export const createListDeleteHandler = (dependencies: Dependencies) =>
  ({ request, listId, listName }: { request: Request; listId: string; listName: string }) =>
    dependencies.authenticatedUserHandler.handle(request, () => undefined, async (context) =>
      Response.json(await dependencies.service.delete(context, listId, decodeURIComponent(listName)), {
        headers: { 'Cache-Control': 'private, no-store' }
      })
    )
