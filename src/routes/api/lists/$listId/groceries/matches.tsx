import { createFileRoute } from '@tanstack/react-router'

import {
  getAuthenticatedUserHandler,
  getSemanticGroceryMatchService
} from '../../../../../modules/composition.server'
import { createSemanticGroceryMatchPostHandler } from '../../../../../modules/groceries/server'

export const Route = createFileRoute('/api/lists/$listId/groceries/matches')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        createSemanticGroceryMatchPostHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          service: getSemanticGroceryMatchService()
        })({ request, listId: params.listId })
    }
  }
})
