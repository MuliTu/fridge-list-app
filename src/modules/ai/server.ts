import '@tanstack/react-start/server-only'

import type { AuthCheckResult } from '../../lib/verifyAuthToken'
import { aiAssistantRequestSchema } from './domain/aiSchemas'
import { createAiAssistantGraph, type AiAnalyzer } from './infrastructure/aiAssistantGraph.server'
import { GeminiAiAnalyzer } from './infrastructure/geminiAiAnalyzer.server'
import { AiRequestResponseLoggingMiddleware } from './infrastructure/aiRequestResponseMiddleware.server'

export { createItemEnrichmentPostHandler } from './itemEnrichment.server'

type AiLogger = {
  success(message: string): void
  warn(message: string): void
  error(message: string): void
}

export type AiAssistantServerOptions = {
  environment: NodeJS.ProcessEnv
  authenticate(request: Request): Promise<AuthCheckResult>
  logger: AiLogger
  analyzer?: AiAnalyzer
  now?: () => Date
}

export const AI_ASSISTANT_TIMEOUT_MS = 90_000

export const getAiFailureResponse = (error: unknown) => {
  const name = error instanceof Error ? error.name : 'unknown_error'
  if (name === 'ZodError' || name === 'SyntaxError') {
    return {
      code: 'AI_INVALID_RESPONSE',
      message: 'The AI returned a response outside the expected format'
    }
  }
  if (name === 'TimeoutError' || name === 'AbortError') {
    return {
      code: 'AI_TIMEOUT',
      message: 'The AI response timed out'
    }
  }
  return {
    code: 'AI_UNAVAILABLE',
    message: 'AI assistant is temporarily unavailable'
  }
}

export const createAiAssistantPostHandler = (options: AiAssistantServerOptions) =>
  async ({ request }: { request: Request }): Promise<Response> => {
    const auth = await options.authenticate(request)
    if (!auth.ok) {
      options.logger.warn(`[ai-assistant] request rejected: unauthorized (${auth.reason})`)
      return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return Response.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON' } }, { status: 400 })
    }
    const parsed = aiAssistantRequestSchema.safeParse(payload)
    if (!parsed.success) {
      const issueSummary = parsed.error.issues
        .slice(0, 10)
        .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`)
        .join(',')
      options.logger.warn(`[ai-assistant] invalid input: ${issueSummary}`)
      return Response.json({ error: { code: 'INVALID_INPUT', message: 'Invalid AI request' } }, { status: 400 })
    }

    const apiKey = options.environment.GOOGLE_API_KEY?.trim() || options.environment.GEMINI_API_KEY?.trim()
    if (!options.analyzer && !apiKey) {
      options.logger.warn('[ai-assistant] GOOGLE_API_KEY or GEMINI_API_KEY is not configured')
      return Response.json(
        { error: { code: 'NOT_CONFIGURED', message: 'AI assistant is not configured' } },
        { status: 503 }
      )
    }

    options.logger.success(`[ai-assistant] ${parsed.data.mode} request accepted`)
    try {
      const baseAnalyzer = options.analyzer ?? new GeminiAiAnalyzer(
        apiKey!,
        options.environment.AI_LIST_MODEL?.trim() || 'gemini-2.5-flash'
      )
      const middleware = new AiRequestResponseLoggingMiddleware(options.logger)
      const graph = createAiAssistantGraph(baseAnalyzer, middleware, options.now)
      const state = await graph.invoke(parsed.data, {
        signal: AbortSignal.timeout(AI_ASSISTANT_TIMEOUT_MS)
      })
      options.logger.success(`[ai-assistant] ${parsed.data.mode} analysis completed`)
      return Response.json({
        result: state.result,
        ignoredCorrectionCount: state.context.ignoredCorrectionCount
      })
    } catch (error: any) {
      options.logger.error(`[ai-assistant] analysis failed: ${error?.name || 'unknown_error'}`)
      return Response.json(
        { error: getAiFailureResponse(error) },
        { status: 502 }
      )
    }
  }
