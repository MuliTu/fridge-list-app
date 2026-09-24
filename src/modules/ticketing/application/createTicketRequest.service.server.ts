import { z } from 'zod'

import type { CreateTicketAccessDecision } from './createTicketAccess.server'
import type { CreateTicketConfig } from '../infrastructure/createTicketConfig.server'
import type { CreateTicketAgentResult } from '../infrastructure/langchain/createTicketGraph'
import type { ManagedCreateTicketPrompt } from '../infrastructure/langchain/managedPrompt.server'

const requestSchema = z.object({
  request: z.string().trim().min(1).max(10_000),
  context: z
    .object({
      route: z.string().max(500).optional(),
      language: z.string().max(20).optional(),
      appVersion: z.string().max(50).optional()
    })
    .optional()
})

export type ValidatedCreateTicketRequest = z.infer<typeof requestSchema>

type RouteErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'ACCESS_DENIED'
  | 'NOT_AVAILABLE'
  | 'SERVER_NOT_CONFIGURED'
  | 'PROMPT_PROVIDER_ERROR'
  | 'MODEL_ERROR'
  | 'TICKET_PROVIDER_ERROR'
  | 'AGENT_ERROR'

export type HandlerLogger = {
  success(message: string): void
  warn(message: string): void
  error(message: string): void
}

export type RunAgentInput = {
  config: CreateTicketConfig
  prompt: ManagedCreateTicketPrompt
  request: ValidatedCreateTicketRequest
  runId: string
}

export type CreateTicketRouteDependencies = {
  environment: NodeJS.ProcessEnv
  createRunId: () => string
  now: () => number
  decideAccess: (
    request: Request,
    environment: NodeJS.ProcessEnv
  ) => Promise<CreateTicketAccessDecision>
  readConfig: (environment: NodeJS.ProcessEnv) => CreateTicketConfig
  loadPrompt: (
    config: CreateTicketConfig['langChain']
  ) => Promise<ManagedCreateTicketPrompt>
  runAgent: (input: RunAgentInput) => Promise<CreateTicketAgentResult>
  logger: HandlerLogger
}

const json = (body: unknown, status: number): Response =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' }
  })

const errorResponse = (
  runId: string,
  status: number,
  code: RouteErrorCode,
  message: string
): Response =>
  json(
    {
      success: false,
      error: { code, message },
      runId
    },
    status
  )

const knownFailure = (
  error: unknown
): { status: number; code: RouteErrorCode; message: string } => {
  const code =
    error instanceof Error && 'code' in error
      ? String((error as Error & { code: unknown }).code)
      : ''

  switch (code) {
    case 'SERVER_NOT_CONFIGURED':
      return {
        status: 500,
        code,
        message: 'Create-ticket server is not configured'
      }
    case 'PROMPT_PROVIDER_ERROR':
      return {
        status: 502,
        code,
        message: 'Managed prompt is unavailable'
      }
    case 'MODEL_ERROR':
      return { status: 502, code, message: 'Ticket model failed' }
    case 'TICKET_PROVIDER_ERROR':
      return { status: 502, code, message: 'Ticket provider failed' }
    case 'AGENT_ERROR':
      return { status: 500, code, message: 'Create-ticket agent failed' }
    default:
      return {
        status: 500,
        code: 'AGENT_ERROR',
        message: 'Create-ticket agent failed'
      }
  }
}

/**
 * Dependency-injected route seam. Tests can prove ordering and side-effect
 * isolation without loading prompts, calling a model, or creating real tickets.
 */
export const createCreateTicketPostHandler = (
  dependencies: CreateTicketRouteDependencies
) => {
  return async ({ request }: { request: Request }): Promise<Response> => {
    const runId = dependencies.createRunId()
    const startedAt = dependencies.now()
    let uid: string | undefined

    const logOutcome = (
      level: keyof HandlerLogger,
      outcome: string,
      metadata = ''
    ) => {
      const durationMs = Math.max(0, dependencies.now() - startedAt)
      dependencies.logger[level](
        `[agent-create-ticket] runId=${runId} uid=${uid ?? 'none'} outcome=${outcome} durationMs=${durationMs}${metadata}`
      )
    }

    let access: CreateTicketAccessDecision
    try {
      access = await dependencies.decideAccess(
        request,
        dependencies.environment
      )
    } catch {
      logOutcome('error', 'AGENT_ERROR')
      return errorResponse(
        runId,
        500,
        'AGENT_ERROR',
        'Create-ticket agent failed'
      )
    }
    if (!access.ok) {
      logOutcome('warn', access.code)
      return errorResponse(
        runId,
        access.status,
        access.code,
        access.message
      )
    }
    uid = access.uid

    let body: unknown
    try {
      body = await request.json()
    } catch {
      logOutcome('warn', 'INVALID_JSON')
      return errorResponse(
        runId,
        400,
        'INVALID_JSON',
        'Request body must be valid JSON'
      )
    }

    const parsedRequest = requestSchema.safeParse(body)
    if (!parsedRequest.success) {
      logOutcome('warn', 'INVALID_REQUEST')
      return errorResponse(
        runId,
        400,
        'INVALID_REQUEST',
        'Request body is invalid'
      )
    }

    try {
      const config = dependencies.readConfig(dependencies.environment)
      const prompt = await dependencies.loadPrompt(config.langChain)
      const result = await dependencies.runAgent({
        config,
        prompt,
        request: parsedRequest.data,
        runId
      })

      logOutcome('success', 'CREATED', ` ticketId=${result.ticket.id}`)
      return json(
        {
          success: true,
          ticket: result.ticket,
          runId
        },
        201
      )
    } catch (error) {
      const failure = knownFailure(error)
      logOutcome(
        failure.status >= 500 ? 'error' : 'warn',
        failure.code
      )
      return errorResponse(
        runId,
        failure.status,
        failure.code,
        failure.message
      )
    }
  }
}
