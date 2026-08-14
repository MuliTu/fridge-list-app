import { createFileRoute } from '@tanstack/react-router'

import { getAuthenticatedUserHandler, getReleasesService } from '../../modules/composition.server'
import type { AuthenticatedUserHandler } from '../../modules/identity/server'
import type { GetReleasesService } from '../../modules/releases'

type ReleasesRouteDependencies = {
  authenticatedUserHandler: AuthenticatedUserHandler
  releases: GetReleasesService
}

export const createGetReleasesHandler =
  (dependencies: ReleasesRouteDependencies) =>
  async ({ request }: { request: Request }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      () => undefined,
      async (context) =>
        Response.json({ releases: await dependencies.releases.execute(context) })
    )

export const Route = createFileRoute('/api/releases')({
  server: {
    handlers: {
      GET: ({ request }) =>
        createGetReleasesHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          releases: getReleasesService()
        })({ request })
    }
  }
})
