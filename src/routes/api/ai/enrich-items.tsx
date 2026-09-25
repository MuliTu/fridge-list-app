import { createFileRoute } from '@tanstack/react-router'

import { logger } from '../../../lib/logger'
import { verifyAuthToken } from '../../../lib/verifyAuthToken'
import { createItemEnrichmentPostHandler } from '../../../modules/ai/server'

export const Route = createFileRoute('/api/ai/enrich-items')({
  server: {
    handlers: {
      POST: createItemEnrichmentPostHandler({
        environment: process.env,
        authenticate: verifyAuthToken,
        logger
      })
    }
  }
})
