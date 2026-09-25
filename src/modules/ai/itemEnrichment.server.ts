import '@tanstack/react-start/server-only'

import type { AuthCheckResult } from '../../lib/verifyAuthToken'
import { aiItemEnrichmentRequestSchema } from './domain/aiSchemas'
import { GeminiItemEnricher, type ItemEnricher } from './infrastructure/geminiItemEnricher.server'
import { createItemEnrichmentGraph } from './infrastructure/itemEnrichmentGraph.server'

type Logger = { success(message: string): void; warn(message: string): void; error(message: string): void }

export const createItemEnrichmentPostHandler = (options: {
  environment: NodeJS.ProcessEnv
  authenticate(request: Request): Promise<AuthCheckResult>
  logger: Logger
  enricher?: ItemEnricher
}) => async ({ request }: { request: Request }): Promise<Response> => {
  const auth = await options.authenticate(request)
  if (!auth.ok) {
    options.logger.warn(`[ai-item-enrichment] request rejected: unauthorized (${auth.reason})`)
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON' } }, { status: 400 })
  }
  const parsed = aiItemEnrichmentRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return Response.json({ error: { code: 'INVALID_INPUT', message: 'Invalid item enrichment request' } }, { status: 400 })
  }

  const apiKey = options.environment.GOOGLE_API_KEY?.trim() || options.environment.GEMINI_API_KEY?.trim()
  if (!options.enricher && !apiKey) {
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
    return Response.json({ result: state.result })
  } catch (error: any) {
    options.logger.error(`[ai-item-enrichment] failed: ${error?.name || 'unknown_error'}`)
    return Response.json(
      { error: { code: 'AI_UNAVAILABLE', message: 'AI item assistant is temporarily unavailable' } },
      { status: 502 }
    )
  }
}
