import '@tanstack/react-start/server-only'

import type { AuthCheckResult } from '../../lib/verifyAuthToken'
import { aiItemEnrichmentRequestSchema } from './domain/aiSchemas'
import {
  aiItemEnrichmentRequestSummary,
  aiItemEnrichmentResponseSummary,
  errorResponseSummary,
  logAiEndpoint
} from './infrastructure/aiEndpointLog.server'
import { GeminiItemEnricher, type ItemEnricher } from './infrastructure/geminiItemEnricher.server'
import { createItemEnrichmentGraph } from './infrastructure/itemEnrichmentGraph.server'

type Logger = { success(message: string): void; warn(message: string): void; error(message: string): void }

export const createItemEnrichmentPostHandler = (options: {
  environment: NodeJS.ProcessEnv
  authenticate(request: Request): Promise<AuthCheckResult>
  logger: Logger
  enricher?: ItemEnricher
  now?: () => Date
}) => async ({ request }: { request: Request }): Promise<Response> => {
  const date = () => (options.now ? options.now() : new Date()).toISOString()
  const auth = await options.authenticate(request)
  if (!auth.ok) {
    options.logger.warn(`[ai-item-enrichment] request rejected: unauthorized (${auth.reason})`)
    logAiEndpoint(options.logger, 'warn', {
      user: 'anonymous',
      action: 'ai_item_enrichment',
      requestObject: request,
      request: { authenticated: false },
      response: errorResponseSummary('UNAUTHORIZED', 401, auth.reason),
      date: date()
    })
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    logAiEndpoint(options.logger, 'warn', {
      user: auth.uid,
      action: 'ai_item_enrichment',
      requestObject: request,
      request: { authenticated: true, parse: 'json' },
      response: errorResponseSummary('INVALID_JSON', 400, 'Invalid JSON'),
      date: date()
    })
    return Response.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON' } }, { status: 400 })
  }
  const parsed = aiItemEnrichmentRequestSchema.safeParse(payload)
  if (!parsed.success) {
    const issueSummary = parsed.error.issues
      .slice(0, 10)
      .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`)
      .join(',')
    options.logger.warn(`[ai-item-enrichment] invalid input: ${issueSummary}`)
    logAiEndpoint(options.logger, 'warn', {
      user: auth.uid,
      action: 'ai_item_enrichment',
      requestObject: request,
      request: { authenticated: true, issueSummary },
      response: errorResponseSummary('INVALID_INPUT', 400, 'Invalid item enrichment request'),
      date: date()
    })
    return Response.json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid item enrichment request' } },
      { status: 400 }
    )
  }
  const requestSummary = aiItemEnrichmentRequestSummary(parsed.data)

  const apiKey = options.environment.GOOGLE_API_KEY?.trim() || options.environment.GEMINI_API_KEY?.trim()
  if (!options.enricher && !apiKey) {
    logAiEndpoint(options.logger, 'warn', {
      user: auth.uid,
      action: 'ai_item_enrichment',
      requestObject: request,
      request: requestSummary,
      response: errorResponseSummary('NOT_CONFIGURED', 503, 'AI assistant is not configured'),
      date: date()
    })
    return Response.json({ error: { code: 'NOT_CONFIGURED', message: 'AI assistant is not configured' } }, { status: 503 })
  }

  try {
    options.logger.success(
      `[ai-item-enrichment] request accepted: items=${parsed.data.items.length} categories=${parsed.data.categories.length}`
    )
    const enricher = options.enricher ?? new GeminiItemEnricher(
      apiKey!,
      options.environment.AI_LIST_MODEL?.trim() || 'gemini-2.5-flash'
    )
    const state = await createItemEnrichmentGraph(enricher).invoke(parsed.data, {
      signal: AbortSignal.timeout(30_000)
    })
    options.logger.success(`[ai-item-enrichment] enriched ${state.result.items.length} item(s)`)
    logAiEndpoint(options.logger, 'success', {
      user: auth.uid,
      action: 'ai_item_enrichment',
      requestObject: request,
      request: requestSummary,
      response: aiItemEnrichmentResponseSummary(state.result),
      date: date()
    })
    return Response.json({ result: state.result })
  } catch (error: any) {
    options.logger.error(`[ai-item-enrichment] failed: ${error?.name || 'unknown_error'}`)
    logAiEndpoint(options.logger, 'error', {
      user: auth.uid,
      action: 'ai_item_enrichment',
      requestObject: request,
      request: requestSummary,
      response: errorResponseSummary(
        'AI_UNAVAILABLE',
        502,
        'AI item assistant is temporarily unavailable'
      ),
      date: date()
    })
    return Response.json(
      { error: { code: 'AI_UNAVAILABLE', message: 'AI item assistant is temporarily unavailable' } },
      { status: 502 }
    )
  }
}
