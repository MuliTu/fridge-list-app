import { createFileRoute } from '@tanstack/react-router'

import { getAuthenticatedUserHandler, getStockCommandService } from '../../../../../modules/composition.server'
import { createStockItemDeleteHandler, createStockItemPatchHandler } from '../../../../../modules/stock/server'

const dependencies = () => ({ authenticatedUserHandler: getAuthenticatedUserHandler(), service: getStockCommandService() })

export const Route = createFileRoute('/api/lists/$listId/stock/$stockId')({
  server: { handlers: {
    PATCH: ({ request, params }) => createStockItemPatchHandler(dependencies())({ request, listId: params.listId, stockId: params.stockId }),
    DELETE: ({ request, params }) => createStockItemDeleteHandler(dependencies())({ request, listId: params.listId, stockId: params.stockId })
  } }
})
