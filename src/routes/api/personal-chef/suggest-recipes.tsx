import { createFileRoute } from '@tanstack/react-router'

import { logger } from '../../../lib/logger'
import {
  getAuthenticatedUserHandler,
  getSuggestRecipesService
} from '../../../modules/composition.server'
import { parseJsonRequest } from '../../../modules/identity/server'

export const Route = createFileRoute('/api/personal-chef/suggest-recipes')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        getAuthenticatedUserHandler().handle(
          request,
          parseJsonRequest,
          async (context, input) => {
            logger.success(
              `[personal-chef] request=${context.requestId} suggestion requested`
            )
            const result = await getSuggestRecipesService().execute(
              context,
              input
            )
            logger.success(
              `[personal-chef] request=${context.requestId} suggestions completed recipes=${result.recipes.length}`
            )
            return Response.json({ success: true, ...result })
          }
        )
    }
  }
})
