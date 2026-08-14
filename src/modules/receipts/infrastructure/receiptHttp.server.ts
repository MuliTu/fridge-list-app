import '@tanstack/react-start/server-only'

import type { AuthenticatedUserHandler } from '../../identity/server'
import { parseJsonRequest } from '../../identity/server'
import type { ReceiptCommandService } from '../application/receiptCommands.service'

type ReceiptHttpDependencies = {
  authenticatedUserHandler: AuthenticatedUserHandler
  service: ReceiptCommandService
}

export const createReceiptSaveHandler =
  (dependencies: ReceiptHttpDependencies) =>
  async ({ request, listId }: { request: Request; listId: string }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      parseJsonRequest,
      async (context, input) =>
        Response.json(await dependencies.service.save(
          context,
          listId,
          input as Record<string, unknown>
        ))
    )

export const createReceiptDeleteHandler =
  (dependencies: ReceiptHttpDependencies) =>
  async ({ request, listId, receiptId }: {
    request: Request
    listId: string
    receiptId: string
  }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      () => undefined,
      async (context) => {
        await dependencies.service.delete(context, listId, receiptId)
        return new Response(null, { status: 204 })
      }
    )

export const createReceiptImageGetHandler =
  (dependencies: ReceiptHttpDependencies) =>
  async ({ request, listId, receiptId }: {
    request: Request
    listId: string
    receiptId: string
  }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      () => undefined,
      async (context) =>
        Response.json(await dependencies.service.getImage(context, listId, receiptId))
    )
