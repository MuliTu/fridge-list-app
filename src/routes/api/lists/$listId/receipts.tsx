import { createFileRoute } from '@tanstack/react-router'

import {
  getAuthenticatedUserHandler,
  getReceiptCommandService
} from '../../../../modules/composition.server'
import { createReceiptSaveHandler } from '../../../../modules/receipts/server'

export const Route = createFileRoute('/api/lists/$listId/receipts')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        createReceiptSaveHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          service: getReceiptCommandService()
        })({ request, listId: params.listId })
    }
  }
})
