import { createFileRoute } from '@tanstack/react-router'

import { logger } from '../../lib/logger'
import {
  getAuthenticatedUserHandler,
  getRecipeCommandService
} from '../../modules/composition.server'
import { parseJsonRequest } from '../../modules/identity/server'

export const Route = createFileRoute('/api/recipes')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        getAuthenticatedUserHandler().handle(
          request,
          parseJsonRequest,
          async (context, input) => {
            logger.success(`[recipes] request=${context.requestId} save requested`)
            const result = await getRecipeCommandService().save(context, input)
            logger.success(
              `[recipes] request=${context.requestId} save completed key=${result.key}`
            )
            return Response.json({ success: true, ...result }, { status: 201 })
          }
        )
    }
  }
})
