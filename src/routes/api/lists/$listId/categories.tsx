import { createFileRoute } from '@tanstack/react-router'

import { getAuthenticatedUserHandler, getCatalogCommandService } from '../../../../modules/composition.server'
import { createCategoryCollectionPostHandler } from '../../../../modules/catalog/server'

export const Route = createFileRoute('/api/lists/$listId/categories')({
  server: { handlers: { POST: ({ request, params }) => createCategoryCollectionPostHandler({
    authenticatedUserHandler: getAuthenticatedUserHandler(), service: getCatalogCommandService()
  })({ request, listId: params.listId }) } }
})
