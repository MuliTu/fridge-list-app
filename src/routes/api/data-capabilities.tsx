import { createFileRoute } from '@tanstack/react-router'

import {
  getAuthenticatedUserHandler,
  getDataCapabilities,
  type DataCapabilities
} from '../../modules/composition.server'
import type { AuthenticatedUserHandler } from '../../modules/identity/server'

type DataCapabilitiesRouteDependencies = {
  authenticatedUserHandler: AuthenticatedUserHandler
  getCapabilities(): DataCapabilities
}

export const createGetDataCapabilitiesHandler =
  (dependencies: DataCapabilitiesRouteDependencies) =>
  async ({ request }: { request: Request }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      () => undefined,
      async () => Response.json(dependencies.getCapabilities())
    )

export const Route = createFileRoute('/api/data-capabilities')({
  server: {
    handlers: {
      GET: ({ request }) =>
        createGetDataCapabilitiesHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          getCapabilities: getDataCapabilities
        })({ request })
    }
  }
})
