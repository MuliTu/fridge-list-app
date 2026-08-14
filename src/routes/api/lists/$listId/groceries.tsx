import { createFileRoute } from '@tanstack/react-router'

import {
  getAuthenticatedUserHandler,
  getGroceryCommandService
} from '../../../../modules/composition.server'
import { createGroceryCollectionPostHandler } from '../../../../modules/groceries/server'

export const Route = createFileRoute('/api/lists/$listId/groceries')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        createGroceryCollectionPostHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          service: getGroceryCommandService()
        })({ request, listId: params.listId })
    }
  }
})
