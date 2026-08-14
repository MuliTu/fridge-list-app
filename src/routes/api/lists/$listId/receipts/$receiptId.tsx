import { createFileRoute } from '@tanstack/react-router'

import {
  getAuthenticatedUserHandler,
  getReceiptCommandService
} from '../../../../../modules/composition.server'
import { createReceiptDeleteHandler } from '../../../../../modules/receipts/server'

export const Route = createFileRoute('/api/lists/$listId/receipts/$receiptId')({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        createReceiptDeleteHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          service: getReceiptCommandService()
        })({ request, listId: params.listId, receiptId: params.receiptId })
    }
  }
})
