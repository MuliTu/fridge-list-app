import '@tanstack/react-start/server-only'

import type { AuthenticatedUserHandler } from '../../identity/server'
import { parseJsonRequest } from '../../identity/server'
import type { SemanticGroceryMatchService } from '../application/semanticGroceryMatch.service'

export type SemanticGroceryMatchHttpDependencies = {
  authenticatedUserHandler: AuthenticatedUserHandler
  service: SemanticGroceryMatchService
}

export const createSemanticGroceryMatchPostHandler = (
  dependencies: SemanticGroceryMatchHttpDependencies
) =>
  ({ request, listId }: { request: Request; listId: string }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      parseJsonRequest,
      async (context, input) =>
        Response.json(await dependencies.service.execute(context, listId, input))
    )
