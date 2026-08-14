import { createFileRoute } from '@tanstack/react-router'

import {
  getAuthenticatedUserHandler,
  getGroceryCommandService
} from '../../../../../../modules/composition.server'
import { createGroceryPurchasedPutHandler } from '../../../../../../modules/groceries/server'

export const Route = createFileRoute(
  '/api/lists/$listId/groceries/$itemId/purchased'
)({
  server: {
    handlers: {
      PUT: ({ request, params }) =>
        createGroceryPurchasedPutHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          service: getGroceryCommandService()
        })({
          request,
          listId: params.listId,
          itemId: params.itemId
        })
    }
  }
})
