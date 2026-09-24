/**
 * @jest-environment node
 */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import type { ChatPromptTemplate } from '@langchain/core/prompts'

import type { CreateTicketAccessDecision, CreateTicketConfig } from '../../../../src/modules/ticketing/server'
import {
  createCreateTicketPostHandler,
  type CreateTicketRouteDependencies
} from '../../../../src/routes/api/agent/create-ticket'

const ticket = {
  id: 'ticket-123',
  url: 'https://tickets.example/ticket-123',
  title: 'Shared lists',
  description: 'Let household members share a list.'
}

const config: CreateTicketConfig = {
  enabled: true,
  allowedUids: new Set(['user-1']),
  model: { name: 'test-model', openAiApiKey: 'secret-openai-key' },
  provider: { type: 'fake' },
  langChain: {
    apiKey: 'secret-langchain-key',
    promptId: 'create-ticket',
    promptVersion: 'v1'
  }
}

const createRequest = (body: string) =>
  new Request('http://localhost/api/agent/create-ticket', {
    method: 'POST',
    headers: {
      authorization: 'Bearer secret-firebase-token',
      'content-type': 'application/json'
    },
    body
  })

const validRequest = () =>
  createRequest(
    JSON.stringify({
      request: '  Add shared lists  ',
      context: {
        route: '/',
        language: 'en',
        appVersion: '2.40.0'
      },
      ignored: 'client data'
    })
  )

const createDependencies = () => {
  let now = 1_000
  const dependencies: CreateTicketRouteDependencies = {
    environment: {
      NODE_ENV: 'test',
      AGENT_CREATE_TICKET_ENABLED: 'true',
      AGENT_CREATE_TICKET_ALLOWED_UIDS: 'user-1'
    },
    createRunId: jest.fn(() => 'run-123'),
    now: jest.fn(() => now++),
    decideAccess: jest.fn(
      async (): Promise<CreateTicketAccessDecision> => ({
        ok: true,
        uid: 'user-1'
      })
    ),
    readConfig: jest.fn(() => config),
    loadPrompt: jest.fn(
      async () => ({}) as ChatPromptTemplate
    ),
    runAgent: jest.fn(async ({ runId }) => ({ ticket, runId })),
    logger: {
      success: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
  }
  return dependencies
}

const callPost = (
  dependencies: CreateTicketRouteDependencies,
  request = validRequest()
) => createCreateTicketPostHandler(dependencies)({ request })

describe('POST /api/agent/create-ticket', () => {
  it.each([
    {
      name: 'production',
      decision: {
        ok: false,
        status: 404,
        code: 'NOT_AVAILABLE',
        message: 'Create-ticket agent is not available'
      } as const
    },
    {
      name: 'disabled',
      decision: {
        ok: false,
        status: 404,
        code: 'NOT_AVAILABLE',
        message: 'Create-ticket agent is not available'
      } as const
    },
    {
      name: 'invalid authentication',
      decision: {
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required'
      } as const
    },
    {
      name: 'non-granted UID',
      decision: {
        ok: false,
        status: 403,
        code: 'ACCESS_DENIED',
        message: 'Access is denied'
      } as const
    }
  ])(
    'returns the safe access rejection for $name before parsing or downstream work',
    async ({ decision }) => {
      const dependencies = createDependencies()
      ;(dependencies.decideAccess as jest.Mock).mockResolvedValue(decision)
      const request = validRequest()
      const jsonSpy = jest.spyOn(request, 'json')

      const response = await callPost(dependencies, request)

      expect(response.status).toBe(decision.status)
      expect(await response.json()).toEqual({
        success: false,
        error: {
          code: decision.code,
          message: decision.message
        },
        runId: 'run-123'
      })
      expect(jsonSpy).not.toHaveBeenCalled()
      expect(dependencies.readConfig).not.toHaveBeenCalled()
      expect(dependencies.loadPrompt).not.toHaveBeenCalled()
      expect(dependencies.runAgent).not.toHaveBeenCalled()
    }
  )

  it('creates runId first and passes the request plus environment to access control', async () => {
    const dependencies = createDependencies()
    const order: string[] = []
    ;(dependencies.createRunId as jest.Mock).mockImplementation(() => {
      order.push('runId')
      return 'run-123'
    })
    ;(dependencies.decideAccess as jest.Mock).mockImplementation(async () => {
      order.push('access')
      return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Authentication is required' }
    })
    const request = validRequest()

    await callPost(dependencies, request)

    expect(order).toEqual(['runId', 'access'])
    expect(dependencies.decideAccess).toHaveBeenCalledWith(
      request,
      dependencies.environment
    )
  })

  it('safely handles an unexpected authentication-boundary failure', async () => {
    const dependencies = createDependencies()
    ;(dependencies.decideAccess as jest.Mock).mockRejectedValue(
      new Error('raw JWKS network details')
    )

    const response = await callPost(dependencies)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toMatchObject({
      success: false,
      error: {
        code: 'AGENT_ERROR',
        message: 'Create-ticket agent failed'
      },
      runId: 'run-123'
    })
    expect(JSON.stringify(body)).not.toContain('JWKS')
    expect(dependencies.readConfig).not.toHaveBeenCalled()
    expect(dependencies.runAgent).not.toHaveBeenCalled()
  })

  it('returns INVALID_JSON before validation, configuration, prompt, or agent work', async () => {
    const dependencies = createDependencies()
    const response = await callPost(dependencies, createRequest('{invalid'))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_JSON' },
      runId: 'run-123'
    })
    expect(dependencies.readConfig).not.toHaveBeenCalled()
    expect(dependencies.loadPrompt).not.toHaveBeenCalled()
    expect(dependencies.runAgent).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { request: '' },
    { request: 123 },
    { request: 'x'.repeat(10_001) },
    { request: 'valid', context: { route: 'x'.repeat(501) } }
  ])('returns INVALID_REQUEST for invalid body %#', async (body) => {
    const dependencies = createDependencies()
    const response = await callPost(
      dependencies,
      createRequest(JSON.stringify(body))
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_REQUEST' }
    })
    expect(dependencies.readConfig).not.toHaveBeenCalled()
    expect(dependencies.runAgent).not.toHaveBeenCalled()
  })

  it('normalizes input and executes config, prompt, then agent in order', async () => {
    const dependencies = createDependencies()
    const order: string[] = []
    ;(dependencies.readConfig as jest.Mock).mockImplementation(() => {
      order.push('config')
      return config
    })
    ;(dependencies.loadPrompt as jest.Mock).mockImplementation(async () => {
      order.push('prompt')
      return {}
    })
    ;(dependencies.runAgent as jest.Mock).mockImplementation(async ({ runId }) => {
      order.push('agent')
      return { ticket, runId }
    })

    const response = await callPost(dependencies)

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      success: true,
      ticket,
      runId: 'run-123'
    })
    expect(order).toEqual(['config', 'prompt', 'agent'])
    expect(dependencies.loadPrompt).toHaveBeenCalledWith(config.langChain)
    expect(dependencies.runAgent).toHaveBeenCalledWith({
      config,
      prompt: {},
      request: {
        request: 'Add shared lists',
        context: {
          route: '/',
          language: 'en',
          appVersion: '2.40.0'
        }
      },
      runId: 'run-123'
    })
  })

  it.each([
    ['SERVER_NOT_CONFIGURED', 500],
    ['PROMPT_PROVIDER_ERROR', 502],
    ['MODEL_ERROR', 502],
    ['TICKET_PROVIDER_ERROR', 502],
    ['AGENT_ERROR', 500]
  ] as const)('maps %s to a safe %i response', async (code, status) => {
    const dependencies = createDependencies()
    const failure = Object.assign(
      new Error(`raw-secret-${code}`),
      { code }
    )

    if (code === 'SERVER_NOT_CONFIGURED') {
      ;(dependencies.readConfig as jest.Mock).mockImplementation(() => {
        throw failure
      })
    } else if (code === 'PROMPT_PROVIDER_ERROR') {
      ;(dependencies.loadPrompt as jest.Mock).mockRejectedValue(failure)
    } else {
      ;(dependencies.runAgent as jest.Mock).mockRejectedValue(failure)
    }

    const response = await callPost(dependencies)
    const serialized = JSON.stringify(await response.json())

    expect(response.status).toBe(status)
    expect(serialized).toContain(code)
    expect(serialized).not.toContain(`raw-secret-${code}`)
  })

  it('maps unexpected failures to safe AGENT_ERROR without secret leakage', async () => {
    const dependencies = createDependencies()
    ;(dependencies.runAgent as jest.Mock).mockRejectedValue(
      new Error('secret token and raw model output')
    )

    const response = await callPost(dependencies)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toMatchObject({
      error: {
        code: 'AGENT_ERROR',
        message: 'Create-ticket agent failed'
      }
    })
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('logs metadata only and never request, prompt, credentials, or token', async () => {
    const dependencies = createDependencies()
    const response = await callPost(dependencies)
    await response.json()

    const logs = JSON.stringify(dependencies.logger)
    expect(dependencies.logger.success).toHaveBeenCalledWith(
      expect.stringContaining(
        'runId=run-123 uid=user-1 outcome=CREATED durationMs='
      )
    )
    expect(logs).not.toContain('Add shared lists')
    expect(logs).not.toContain('secret-openai-key')
    expect(logs).not.toContain('secret-langchain-key')
    expect(logs).not.toContain('secret-firebase-token')
  })
})
