import '@tanstack/react-start/server-only'

import type { AuthenticatedUserHandler } from '../../identity/server'
import { parseJsonRequest } from '../../identity/server'
import type { StockCommandService } from '../application/stockCommands.service'

type Dependencies = { authenticatedUserHandler: AuthenticatedUserHandler; service: StockCommandService }
const empty = () => new Response(null, { status: 204 })

export const createStockCollectionPostHandler = (dependencies: Dependencies) =>
  ({ request, listId }: { request: Request; listId: string }) =>
    dependencies.authenticatedUserHandler.handle(request, parseJsonRequest, async (context, input) =>
      Response.json(await dependencies.service.create(context, listId, input as never)))

export const createStockItemPatchHandler = (dependencies: Dependencies) =>
  ({ request, listId, stockId }: { request: Request; listId: string; stockId: string }) =>
    dependencies.authenticatedUserHandler.handle(request, parseJsonRequest, async (context, input) => {
      await dependencies.service.update(context, listId, stockId, input as never)
      return empty()
    })

export const createStockItemDeleteHandler = (dependencies: Dependencies) =>
  ({ request, listId, stockId }: { request: Request; listId: string; stockId: string }) =>
    dependencies.authenticatedUserHandler.handle(request, () => undefined, async (context) => {
      await dependencies.service.delete(context, listId, stockId)
      return empty()
    })
