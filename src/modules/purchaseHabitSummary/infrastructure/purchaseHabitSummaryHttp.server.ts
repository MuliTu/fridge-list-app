import '@tanstack/react-start/server-only'

import { logger as defaultLogger } from '../../../lib/logger'
import { verifyAuthToken as defaultVerifyAuthToken } from '../../../lib/verifyAuthToken'
import { ApplicationError } from '../../shared'
import { toHttpErrorResponse } from '../../shared/server'
import { GetPurchaseHabitSummaryService } from '../application/getPurchaseHabitSummary.service'
import { N8nPurchaseHabitSummaryProvider } from './n8nPurchaseHabitSummaryProvider.server'

type Logger = Pick<typeof defaultLogger, 'error' | 'success' | 'warn'>
type VerifyAuthToken = typeof defaultVerifyAuthToken

type PurchaseHabitSummaryHandlerDependencies = {
  createService?: () => GetPurchaseHabitSummaryService | null
  logger?: Logger
  verifyAuthToken?: VerifyAuthToken
}

export const createPurchaseHabitSummaryHandler = (
  dependencies: PurchaseHabitSummaryHandlerDependencies = {}
) => {
  const logger = dependencies.logger ?? defaultLogger
  const verifyAuthToken = dependencies.verifyAuthToken ?? defaultVerifyAuthToken

  return async ({ request }: { request: Request }): Promise<Response> => {
    try {
      const authResult = await verifyAuthToken(request)
      if (!authResult.ok) {
        logger.warn(`[purchase-habit-summary] request rejected: unauthorized (${authResult.reason})`)
        return Response.json({ error: true, message: 'unauthorized' }, { status: 401 })
      }

      const body = await parseRequestBody(request)
      const changes = Array.isArray(body?.changes) ? body.changes : []
      if (changes.length === 0) {
        logger.success('[purchase-habit-summary] no changes to summarize, skipping n8n call')
        return Response.json({ summary: [] })
      }

      const service = dependencies.createService?.() ?? createDefaultPurchaseHabitSummaryService()
      if (!service) {
        logger.error('[purchase-habit-summary] PURCHASE_HABIT_SUMMARY_WEBHOOK_URL is not configured')
        return Response.json({ error: true, message: 'not_configured' }, { status: 500 })
      }

      if (changes.length > 0) {
        logger.success(`[purchase-habit-summary] request received: ${changes.length} change(s)`)
        logger.success('[purchase-habit-summary] forwarding to n8n webhook...')
      }

      const result = await service.execute(body)
      const summary = getSummary(result.body)
      if (changes.length > 0 && summary.length === 0) {
        logger.warn(`[purchase-habit-summary] upstream returned no summary: status=${result.status}`)
      } else if (changes.length > 0) {
        logger.success(
          `[purchase-habit-summary] upstream responded: status=${result.status}, sentences=${summary.length}`
        )
      }
      return Response.json(result.body, { status: result.status })
    } catch (error) {
      if (error instanceof ApplicationError && error.code === 'upstream_failed') {
        logger.error(`[purchase-habit-summary] upstream call failed: ${error.message}`)
        return Response.json(
          { error: true, message: 'purchase habit summary upstream failed' },
          { status: 502 }
        )
      }
      logger.error('[purchase-habit-summary] request failed unexpectedly')
      return toHttpErrorResponse(error)
    }
  }
}

const parseRequestBody = async (request: Request): Promise<{ changes?: unknown }> => {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body : {}
  } catch (error) {
    throw new ApplicationError('invalid_input', 'Request body must be valid JSON', error)
  }
}

const createDefaultPurchaseHabitSummaryService = (): GetPurchaseHabitSummaryService | null => {
  const webhookUrl = process.env.PURCHASE_HABIT_SUMMARY_WEBHOOK_URL?.trim()
  if (!webhookUrl) return null
  return new GetPurchaseHabitSummaryService(new N8nPurchaseHabitSummaryProvider(webhookUrl))
}

const getSummary = (body: unknown): unknown[] => {
  if (!body || typeof body !== 'object') return []
  const summary = (body as { summary?: unknown }).summary
  return Array.isArray(summary) ? summary : []
}
