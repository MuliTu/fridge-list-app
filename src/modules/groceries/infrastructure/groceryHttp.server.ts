import '@tanstack/react-start/server-only'

import type {
  AddGroceryInput,
  GroceryCommandService
} from '../application/groceryCommands.service'
import type { AuthenticatedUserHandler } from '../../identity/server'
import { parseJsonRequest } from '../../identity/server'

export type GroceryHttpDependencies = {
  authenticatedUserHandler: AuthenticatedUserHandler
  service: GroceryCommandService
}

const noContent = (): Response => new Response(null, { status: 204 })

export const createGroceryCollectionPostHandler = (
  dependencies: GroceryHttpDependencies
) =>
  ({ request, listId }: { request: Request; listId: string }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      parseJsonRequest<AddGroceryInput>,
      async (context, input) =>
        Response.json(await dependencies.service.add(context, listId, input))
    )

export const createGroceryItemPatchHandler = (
  dependencies: GroceryHttpDependencies
) =>
  ({ request, listId, itemId }: { request: Request; listId: string; itemId: string }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      parseJsonRequest,
      async (context, input) => {
        const body = input && typeof input === 'object'
          ? input as Record<string, unknown>
          : {}
        const isDetailUpdate = ['note', 'quantity', 'unit'].some(
          (key) => body[key] !== undefined
        )
        if (isDetailUpdate) {
          await dependencies.service.updateDetails(context, listId, itemId, body)
        } else {
          await dependencies.service.update(context, listId, itemId, body)
        }
        return noContent()
      }
    )

export const createGroceryPurchasedPutHandler = (
  dependencies: GroceryHttpDependencies
) =>
  ({ request, listId, itemId }: { request: Request; listId: string; itemId: string }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      parseJsonRequest,
      async (context, input: unknown) => {
        const bought = input && typeof input === 'object'
          ? (input as Record<string, unknown>).bought
          : undefined
        await dependencies.service.setPurchased(context, listId, itemId, bought)
        return noContent()
      }
    )

export const createGroceryItemDeleteHandler = (
  dependencies: GroceryHttpDependencies
) =>
  ({ request, listId, itemId }: { request: Request; listId: string; itemId: string }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      () => undefined,
      async (context) => {
        await dependencies.service.delete(context, listId, itemId)
        return noContent()
      }
    )
