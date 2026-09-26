/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { ZodError, z } from 'zod'
import {
  AI_ASSISTANT_TIMEOUT_MS,
  createAiAssistantPostHandler,
  getAiFailureResponse
} from './server'

const requestBody = {
  mode: 'insights',
  language: 'en',
  householdName: 'Home',
  items: [],
  changes: [],
  purchases: [],
  categories: ['Other']
}

const logger = { success: jest.fn(), warn: jest.fn(), error: jest.fn() }

describe('AI assistant server', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('allows production-sized Gemini reviews to finish within a bounded timeout', () => {
    expect(AI_ASSISTANT_TIMEOUT_MS).toBe(90_000)
  })

  it('authenticates before parsing or model execution', async () => {
    const analyzer = { analyze: jest.fn() }
    const handler = createAiAssistantPostHandler({
      environment: {},
      authenticate: jest.fn().mockResolvedValue({ ok: false, reason: 'bad token' }),
      logger,
      analyzer
    })

    const response = await handler({ request: new Request('http://localhost/api/ai/analyze', { method: 'POST', body: 'not-json' }) })

    expect(response.status).toBe(401)
    expect(analyzer.analyze).not.toHaveBeenCalled()
  })

  it('returns a grounded result from an injected analyzer without requiring a real Gemini key', async () => {
    const analyzer = {
      analyze: jest.fn().mockResolvedValue({
        mode: 'insights',
        summary: ['Useful summary'],
        nextSteps: [],
        proposedList: null
      })
    }
    const handler = createAiAssistantPostHandler({
      environment: {},
      authenticate: jest.fn().mockResolvedValue({ ok: true, uid: 'user-1' }),
      logger,
      analyzer,
      now: () => new Date('2026-09-03T12:00:00Z')
    })

    const response = await handler({
      request: new Request('http://localhost/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      result: { mode: 'insights', summary: ['Useful summary'], nextSteps: [], proposedList: null },
      ignoredCorrectionCount: 0
    })
    expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('[ai-endpoint]'))
    const endpointLog = logger.success.mock.calls
      .map(([message]) => message)
      .find((message) => message.startsWith('[ai-endpoint] '))
    expect(endpointLog).toBeTruthy()
    expect(JSON.parse(endpointLog!.replace('[ai-endpoint] ', ''))).toEqual({
      user: 'user-1',
      action: 'insights',
      route: '/api/ai/analyze',
      request: {
        mode: 'insights',
        language: 'en',
        itemCount: 0,
        changeCount: 0,
        purchaseCount: 0,
        categoryCount: 1
      },
      response: {
        ok: true,
        summary: 'mode=insights summaryPoints=1 nextSteps=0 proposedItems=0',
        ignoredCorrectionCount: 0
      },
      date: '2026-09-03T12:00:00.000Z'
    })
  })

  it('fails closed when Gemini is not configured', async () => {
    const handler = createAiAssistantPostHandler({
      environment: {},
      authenticate: jest.fn().mockResolvedValue({ ok: true, uid: 'user-1' }),
      logger
    })
    const response = await handler({
      request: new Request('http://localhost/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      })
    })
    expect(response.status).toBe(503)
  })

  it('returns a safe, actionable code when Gemini output fails validation', () => {
    const invalidResponse = z.object({ value: z.string() }).safeParse({}).error
    expect(invalidResponse).toBeInstanceOf(ZodError)
    expect(getAiFailureResponse(invalidResponse)).toEqual({
      code: 'AI_INVALID_RESPONSE',
      message: 'The AI returned a response outside the expected format'
    })
  })

  it('logs invalid AI responses with the endpoint shape', async () => {
    const analyzer = {
      analyze: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
    }
    const handler = createAiAssistantPostHandler({
      environment: {},
      authenticate: jest.fn().mockResolvedValue({ ok: true, uid: 'user-1' }),
      logger,
      analyzer,
      now: () => new Date('2026-09-03T12:00:00Z')
    })

    const response = await handler({
      request: new Request('http://localhost/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
    })

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: {
        code: 'AI_INVALID_RESPONSE',
        message: 'The AI returned a response outside the expected format'
      }
    })
    const endpointLog = logger.error.mock.calls
      .map(([message]) => message)
      .find((message) => message.startsWith('[ai-endpoint] '))
    expect(endpointLog).toBeTruthy()
    expect(JSON.parse(endpointLog!.replace('[ai-endpoint] ', ''))).toMatchObject({
      user: 'user-1',
      action: 'insights',
      route: '/api/ai/analyze',
      response: {
        ok: false,
        status: 502,
        code: 'AI_INVALID_RESPONSE',
        message: 'The AI returned a response outside the expected format'
      },
      date: '2026-09-03T12:00:00.000Z'
    })
  })
})
