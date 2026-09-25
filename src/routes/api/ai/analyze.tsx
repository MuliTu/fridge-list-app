import { createFileRoute } from '@tanstack/react-router'

import { logger } from '../../../lib/logger'
import { verifyAuthToken } from '../../../lib/verifyAuthToken'
import { createAiAssistantPostHandler } from '../../../modules/ai/server'

export const createAiAnalyzePostHandler = () =>
  createAiAssistantPostHandler({
    environment: process.env,
    authenticate: verifyAuthToken,
    logger
  })

export const Route = createFileRoute('/api/ai/analyze')({
  server: {
    handlers: {
      POST: createAiAnalyzePostHandler()
    }
  }
})

