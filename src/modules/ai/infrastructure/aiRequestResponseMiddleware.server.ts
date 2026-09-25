import '@tanstack/react-start/server-only'

import type { RetrievedAiContext } from '../application/aiRetrieval'
import type { AiAssistantResult } from '../domain/aiSchemas'

export type AiMiddlewareLogger = {
  success(message: string): void
  error(message: string): void
}

export const summarizeAiResponse = (result: AiAssistantResult): string => {
  if (result.mode === 'insights') {
    return [
      'mode=insights',
      `summaryPoints=${result.summary.length}`,
      `nextSteps=${result.nextSteps.length}`,
      `proposedItems=${result.proposedList?.items.length ?? 0}`
    ].join(' ')
  }

  const removals = result.duplicates.reduce(
    (total, group) => total + group.removeKeys.length,
    0
  )
  return [
    'mode=list_review',
    `duplicateGroups=${result.duplicates.length}`,
    `proposedRemovals=${removals}`,
    `proposedRenames=${result.renames.length}`
  ].join(' ')
}

/**
 * Provider-neutral middleware used by explicit LangGraph nodes.
 *
 * Grocery names, household names, prompt text, and model output are deliberately
 * excluded from application logs. LangSmith remains the opt-in destination for
 * full traces; the regular server log receives only bounded operational metadata.
 */
export class AiRequestResponseLoggingMiddleware {
  constructor(
    private readonly logger: AiMiddlewareLogger,
    private readonly clock: () => number = Date.now
  ) {}

  logRequest(context: RetrievedAiContext): number {
    const startedAt = this.clock()
    this.logger.success(
      `[ai-middleware] request mode=${context.mode} items=${context.items.length} changes=${context.changes.length} purchases=${context.purchases.length} categories=${context.categories.length} ignoredCorrections=${context.ignoredCorrectionCount}`
    )
    return startedAt
  }

  summarizeResponse(result: AiAssistantResult, startedAt: number): string {
    const summary = summarizeAiResponse(result)
    this.logger.success(
      `[ai-middleware] response ${summary} durationMs=${Math.max(0, this.clock() - startedAt)}`
    )
    return summary
  }

  logFailure(mode: RetrievedAiContext['mode'], error: unknown, startedAt: number): void {
    const errorName = error instanceof Error ? error.name : 'unknown_error'
    this.logger.error(
      `[ai-middleware] response mode=${mode} status=failed error=${errorName} durationMs=${Math.max(0, this.clock() - startedAt)}`
    )
  }
}
