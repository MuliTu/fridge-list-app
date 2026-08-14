import { createFileRoute } from '@tanstack/react-router'

import {
  getAuthenticatedUserHandler,
  getRecordClientEventService
} from '../../modules/composition.server'
import type { AuthenticatedUserHandler } from '../../modules/identity/server'
import type { RecordClientEventService } from '../../modules/observability'
import { parseJsonRequest } from '../../modules/identity/server'

type ClientEventRouteDependencies = {
  authenticatedUserHandler: AuthenticatedUserHandler
  recordClientEvent: RecordClientEventService
}

export const createRecordClientEventHandler =
  (dependencies: ClientEventRouteDependencies) =>
  async ({ request }: { request: Request }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      parseJsonRequest,
      async (context, input) => {
        await dependencies.recordClientEvent.execute(context, input)
        return new Response(null, { status: 204 })
      }
    )

export const Route = createFileRoute('/api/client-log')({
  server: {
    handlers: {
      POST: ({ request }) =>
        createRecordClientEventHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          recordClientEvent: getRecordClientEventService()
        })({ request })
    }
  }
})
