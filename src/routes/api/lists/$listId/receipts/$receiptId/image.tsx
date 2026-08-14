import { createFileRoute } from '@tanstack/react-router'

import {
  getAuthenticatedUserHandler,
  getReceiptCommandService
} from '../../../../../../modules/composition.server'
import { createReceiptImageGetHandler } from '../../../../../../modules/receipts/server'

export const Route = createFileRoute('/api/lists/$listId/receipts/$receiptId/image')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        createReceiptImageGetHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          service: getReceiptCommandService()
        })({ request, listId: params.listId, receiptId: params.receiptId })
    }
  }
})
