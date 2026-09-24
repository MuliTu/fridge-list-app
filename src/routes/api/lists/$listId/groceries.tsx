import { createFileRoute } from '@tanstack/react-router'

import {
  getAuthenticatedUserHandler,
  getGroceryCommandService,
  getGroceryReadService
} from '../../../../modules/composition.server'
import {
  createGroceryCollectionGetHandler,
  createGroceryCollectionPostHandler
} from '../../../../modules/groceries/server'

export const Route = createFileRoute('/api/lists/$listId/groceries')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        createGroceryCollectionGetHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          service: getGroceryReadService()
        })({ request, listId: params.listId }),
      POST: ({ request, params }) =>
        createGroceryCollectionPostHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          service: getGroceryCommandService()
        })({ request, listId: params.listId })
    }
  }
})
