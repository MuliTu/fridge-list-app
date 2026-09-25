import '@tanstack/react-start/server-only'

import type { RetrievedAiContext } from '../application/aiRetrieval'
import type { AiAssistantResult } from '../domain/aiSchemas'
import { logger } from '../../../lib/logger'
import { createAiAssistantGraph, type AiAnalyzer } from './aiAssistantGraph.server'
import { GeminiAiAnalyzer } from './geminiAiAnalyzer.server'
import { AiRequestResponseLoggingMiddleware } from './aiRequestResponseMiddleware.server'

/**
 * LangGraph Studio adapter for the grocery AI assistant.
 *
 * Credential validation is intentionally lazy so Studio can boot, display the
 * graph, and validate its input without also requiring the unrelated ticket-agent
 * environment. A missing Gemini key becomes a focused invocation error.
 */
class StudioGeminiAnalyzer implements AiAnalyzer {
  async analyze(context: RetrievedAiContext): Promise<AiAssistantResult> {
    const apiKey = process.env.GOOGLE_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY is required to invoke the ai_assistant graph')
    }

    return new GeminiAiAnalyzer(
      apiKey,
      process.env.AI_LIST_MODEL?.trim() || 'gemini-2.5-flash'
    ).analyze(context)
  }
}

/**
 * Studio input is the request itself:
 * { "mode": "insights", "language": "en", ... }
 */
export const graph = createAiAssistantGraph(
  new StudioGeminiAnalyzer(),
  new AiRequestResponseLoggingMiddleware(logger)
)
