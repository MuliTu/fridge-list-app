import { createFileRoute } from '@tanstack/react-router'

import { handleListDelete } from '../../../../../modules/listManagement/server'

export const Route = createFileRoute('/api/lists/$listId/shopping-lists/$listName')({
  server: {
    handlers: {
      DELETE: ({ request, params }) => handleListDelete(request, params.listId, params.listName)
    }
  }
})
