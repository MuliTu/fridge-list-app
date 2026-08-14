import { ChatOpenAI } from '@langchain/openai'

import type { AuthCheckResult } from '../../lib/verifyAuthToken'
import type { HandlerLogger } from './application/createTicketRequest.service.server'
import {
  createCreateTicketPostHandler as createApplicationPostHandler,
  type CreateTicketRouteDependencies,
  type RunAgentInput
} from './application/createTicketRequest.service.server'
import {
  decideCreateTicketAccess as decideApplicationAccess,
  type CreateTicketAccessDecision
} from './application/createTicketAccess.server'
import type { TicketProvider } from './application/ticketProvider'
import {
  readCreateTicketConfig,
  type CreateTicketConfig
} from './infrastructure/createTicketConfig.server'
import { createCreateTicketAgent } from './infrastructure/langchain/createTicketAgent'
import type { CreateTicketAgentResult } from './infrastructure/langchain/createTicketGraph'
import {
  loadManagedCreateTicketPrompt,
  type ManagedCreateTicketPrompt
} from './infrastructure/langchain/managedPrompt.server'
import { FakeTicketProvider } from './infrastructure/providers/fakeTicketProvider'
import { TrelloTicketProvider } from './infrastructure/providers/trelloTicketProvider'

export type TicketingServerOptions = {
  environment: NodeJS.ProcessEnv
  authenticate: (request: Request) => Promise<AuthCheckResult>
  createRunId: () => string
  now: () => number
  logger: HandlerLogger
}

export type TicketingServer = {
  decideCreateTicketAccess(request: Request): Promise<CreateTicketAccessDecision>
  createCreateTicketPostHandler(
    overrides?: Partial<CreateTicketRouteDependencies>
  ): ReturnType<typeof createApplicationPostHandler>
}

const createProvider = (config: CreateTicketConfig['provider']): TicketProvider =>
  config.type === 'fake' ? new FakeTicketProvider() : new TrelloTicketProvider(config)

const runConfiguredAgent = async ({
  config,
  prompt,
  request,
  runId
}: RunAgentInput): Promise<CreateTicketAgentResult> => {
  const model = new ChatOpenAI({
    model: config.model.name,
    apiKey: config.model.openAiApiKey,
    temperature: 0
  })
  const agent = createCreateTicketAgent({
    model,
    prompt: prompt as ManagedCreateTicketPrompt,
    provider: createProvider(config.provider)
  })
  return agent({ request: request.request, context: request.context, runId })
}

export const createTicketingServer = (options: TicketingServerOptions): TicketingServer => {
  const decideCreateTicketAccess = (request: Request) =>
    decideApplicationAccess(request, {
      environment: options.environment,
      authenticate: options.authenticate
    })

  const dependencies: CreateTicketRouteDependencies = {
    environment: options.environment,
    createRunId: options.createRunId,
    now: options.now,
    decideAccess: (request) => decideCreateTicketAccess(request),
    readConfig: readCreateTicketConfig,
    loadPrompt: loadManagedCreateTicketPrompt,
    runAgent: runConfiguredAgent,
    logger: options.logger
  }

  return {
    decideCreateTicketAccess,
    createCreateTicketPostHandler: (overrides = {}) =>
      createApplicationPostHandler({ ...dependencies, ...overrides })
  }
}

export type {
  CreateTicketAccessDecision,
  CreateTicketAccessRejection
} from './application/createTicketAccess.server'
export type { CreateTicketRouteDependencies } from './application/createTicketRequest.service.server'
export type { CreateTicketConfig } from './infrastructure/createTicketConfig.server'
