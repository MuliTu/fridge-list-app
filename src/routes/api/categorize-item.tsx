import { createFileRoute } from '@tanstack/react-router'

import {
  getAuthenticatedUserHandler,
  getCategorizeItemService
} from '../../modules/composition.server'
import type { CategorizeItemService } from '../../modules/catalog'
import { parseJsonRequest, type AuthenticatedUserHandler } from '../../modules/identity/server'

type CategorizeItemRouteDependencies = {
  authenticatedUserHandler: AuthenticatedUserHandler
  categorizeItem: CategorizeItemService
}

export const createCategorizeItemHandler =
  (dependencies: CategorizeItemRouteDependencies) =>
  async ({ request }: { request: Request }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      parseJsonRequest,
      async (context, input) =>
        Response.json(await dependencies.categorizeItem.execute(context, input))
    )

export const Route = createFileRoute('/api/categorize-item')({
  server: {
    handlers: {
      POST: ({ request }) =>
        createCategorizeItemHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          categorizeItem: getCategorizeItemService()
        })({ request })
    }
  }
})
