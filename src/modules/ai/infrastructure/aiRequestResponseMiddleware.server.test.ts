/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import type { RetrievedAiContext } from '../application/aiRetrieval'
import {
  AiRequestResponseLoggingMiddleware,
  summarizeAiResponse
} from './aiRequestResponseMiddleware.server'

const context: RetrievedAiContext = {
  mode: 'insights',
  language: 'en',
  householdName: 'Private household name',
  items: [{
    key: 'item-1',
    name: 'Private grocery name',
    category: 'Other',
    bought: false,
    listName: null,
    addedAt: '2026-09-04T00:00:00.000Z',
    modifiedAt: null
  }],
  changes: [],
  purchases: [],
  categories: ['Other'],
  ignoredCorrectionCount: 0
}

describe('AI request/response logging middleware', () => {
  it('logs request metadata and a deterministic response summary without item content', async () => {
    const result = {
      mode: 'insights' as const,
      summary: ['Private generated summary'],
      nextSteps: ['Private next step'],
      proposedList: null
    }
    const logger = { success: jest.fn(), error: jest.fn() }
    const times = [100, 125]
    const middleware = new AiRequestResponseLoggingMiddleware(logger, () => times.shift()!)

    const startedAt = middleware.logRequest(context)
    expect(middleware.summarizeResponse(result, startedAt)).toBe(
      'mode=insights summaryPoints=1 nextSteps=1 proposedItems=0'
    )

    const logs = logger.success.mock.calls.flat().join('\n')
    expect(logs).toContain('request mode=insights items=1')
    expect(logs).toContain('response mode=insights summaryPoints=1 nextSteps=1 proposedItems=0 durationMs=25')
    expect(logs).not.toContain('Private grocery name')
    expect(logs).not.toContain('Private generated summary')
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs a bounded failure summary without exposing the error message', () => {
    const failure = new TypeError('private upstream message')
    const logger = { success: jest.fn(), error: jest.fn() }
    const middleware = new AiRequestResponseLoggingMiddleware(logger, () => 100)

    middleware.logFailure(context.mode, failure, 100)
    expect(logger.error).toHaveBeenCalledWith(
      '[ai-middleware] response mode=insights status=failed error=TypeError durationMs=0'
    )
    expect(logger.error.mock.calls.flat().join('\n')).not.toContain('private upstream message')
  })

  it('summarizes list-review counts', () => {
    expect(summarizeAiResponse({
      mode: 'list_review',
      duplicates: [{ keepKey: 'a', removeKeys: ['b', 'c'], reason: 'same item' }],
      renames: [{ key: 'a', currentName: 'Old', suggestedName: 'New', reason: 'canonical' }]
    })).toBe('mode=list_review duplicateGroups=1 proposedRemovals=2 proposedRenames=1')
  })
})
