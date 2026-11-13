import { createFileRoute } from '@tanstack/react-router'

import { createBackgroundAiReviewHandler } from '../../../../modules/ai/server'
import { getAuthenticatedUserHandler } from '../../../../modules/composition.server'

const handle = createBackgroundAiReviewHandler({
  environment: process.env,
  getAuthenticatedUserHandler
})

export const Route = createFileRoute('/api/lists/$listId/background-ai-review')({
  server: {
    handlers: {
      GET: ({ request, params }) => handle({ request, listId: params.listId }),
      POST: ({ request, params }) => handle({ request, listId: params.listId }),
      PUT: ({ request, params }) => handle({ request, listId: params.listId })
    }
  }
})
