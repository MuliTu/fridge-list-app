import '@tanstack/react-start/server-only'

import type { AuthenticatedUserHandler } from '../../identity/server'
import { parseJsonRequest } from '../../identity/server'
import type { CatalogCommandService } from '../application/catalogCommands.service'

type Dependencies = { authenticatedUserHandler: AuthenticatedUserHandler; service: CatalogCommandService }
const empty = () => new Response(null, { status: 204 })

export const createCategoryCollectionPostHandler = (dependencies: Dependencies) =>
  ({ request, listId }: { request: Request; listId: string }) =>
    dependencies.authenticatedUserHandler.handle(request, parseJsonRequest, async (context, input) =>
      Response.json(await dependencies.service.create(context, listId, input as never)))

export const createCategoryItemPatchHandler = (dependencies: Dependencies) =>
  ({ request, listId, categoryId }: { request: Request; listId: string; categoryId: string }) =>
    dependencies.authenticatedUserHandler.handle(request, parseJsonRequest, async (context, input) => {
      await dependencies.service.update(context, listId, categoryId, input as never)
      return empty()
    })

export const createCategoryItemDeleteHandler = (dependencies: Dependencies) =>
  ({ request, listId, categoryId }: { request: Request; listId: string; categoryId: string }) =>
    dependencies.authenticatedUserHandler.handle(request, () => undefined, async (context) => {
      await dependencies.service.delete(context, listId, categoryId)
      return empty()
    })
