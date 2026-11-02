import { createFileRoute } from '@tanstack/react-router'

import { getAuthenticatedUserHandler, getStockCommandService } from '../../../../modules/composition.server'
import { createStockCollectionPostHandler } from '../../../../modules/stock/server'

export const Route = createFileRoute('/api/lists/$listId/stock')({
  server: { handlers: { POST: ({ request, params }) => createStockCollectionPostHandler({
    authenticatedUserHandler: getAuthenticatedUserHandler(), service: getStockCommandService()
  })({ request, listId: params.listId }) } }
})
