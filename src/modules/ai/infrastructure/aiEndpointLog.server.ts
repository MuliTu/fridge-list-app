import '@tanstack/react-start/server-only'

import type {
  AiAssistantRequest,
  AiAssistantResult,
  AiItemEnrichmentRequest,
  AiItemEnrichmentResult
} from '../domain/aiSchemas'
import { summarizeAiResponse } from './aiRequestResponseMiddleware.server'

type EndpointLogger = {
  success(message: string): void
  warn(message: string): void
  error(message: string): void
}

type LogLevel = keyof EndpointLogger

type AiEndpointLogEvent = {
  user: string
  action: string
  route: string
  request: Record<string, unknown>
  response: Record<string, unknown>
  date: string
}

const routeFrom = (request: Request): string => {
  try {
    return new URL(request.url).pathname
  } catch {
    return request.url
  }
}

export const aiAnalyzeRequestSummary = (request: AiAssistantRequest): Record<string, unknown> => ({
  mode: request.mode,
  language: request.language,
  itemCount: request.items.length,
  changeCount: request.changes.length,
  purchaseCount: request.purchases.length,
  categoryCount: request.categories.length
})

export const aiAnalyzeResponseSummary = (
  result: AiAssistantResult,
  ignoredCorrectionCount: number
): Record<string, unknown> => ({
  ok: true,
  summary: summarizeAiResponse(result),
  ignoredCorrectionCount
})

export const aiItemEnrichmentRequestSummary = (
  request: AiItemEnrichmentRequest
): Record<string, unknown> => ({
  language: request.language,
  itemCount: request.items.length,
  categoryCount: request.categories.length
})

export const aiItemEnrichmentResponseSummary = (
  result: AiItemEnrichmentResult
): Record<string, unknown> => ({
  ok: true,
  itemCount: result.items.length,
  existingCategoryCount: result.items.filter((item) => item.categoryStatus === 'existing').length,
  suggestedCategoryCount: result.items.filter((item) => item.categoryStatus === 'suggested').length
})

export const errorResponseSummary = (
  code: string,
  status: number,
  message?: string
): Record<string, unknown> => ({
  ok: false,
  status,
  code,
  message
})

export const logAiEndpoint = (
  logger: EndpointLogger,
  level: LogLevel,
  event: Omit<AiEndpointLogEvent, 'route'> & { requestObject: Request }
): void => {
  const { requestObject, ...rest } = event
  const route = routeFrom(requestObject)
  logger[level](`[ai-endpoint] ${JSON.stringify({
    user: rest.user,
    action: rest.action,
    route,
    request: rest.request,
    response: rest.response,
    date: rest.date
  })}`)
}
