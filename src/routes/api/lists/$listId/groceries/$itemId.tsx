import { createFileRoute } from '@tanstack/react-router'

import {
  getAuthenticatedUserHandler,
  getGroceryCommandService
} from '../../../../../modules/composition.server'
import {
  createGroceryItemDeleteHandler,
  createGroceryItemPatchHandler
} from '../../../../../modules/groceries/server'

const dependencies = () => ({
  authenticatedUserHandler: getAuthenticatedUserHandler(),
  service: getGroceryCommandService()
})

export const Route = createFileRoute('/api/lists/$listId/groceries/$itemId')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        createGroceryItemPatchHandler(dependencies())({
          request,
          listId: params.listId,
          itemId: params.itemId
        }),
      DELETE: ({ request, params }) =>
        createGroceryItemDeleteHandler(dependencies())({
          request,
          listId: params.listId,
          itemId: params.itemId
        })
    }
  }
})
