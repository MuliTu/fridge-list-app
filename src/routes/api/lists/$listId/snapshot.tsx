import { createFileRoute } from '@tanstack/react-router'

import { getAuthenticatedUserHandler, getHouseholdSnapshotService } from '../../../../modules/composition.server'

export const Route = createFileRoute('/api/lists/$listId/snapshot')({
  server: { handlers: { GET: ({ request, params }) =>
    getAuthenticatedUserHandler().handle(request, () => undefined, async (context) =>
      Response.json(await getHouseholdSnapshotService().get(context, params.listId)))
  } }
})
