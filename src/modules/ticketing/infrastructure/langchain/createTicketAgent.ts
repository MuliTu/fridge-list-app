import type { ChatPromptTemplate } from '@langchain/core/prompts'

import {
  createTicketGraph,
  type CreateTicketAgentInput,
  type CreateTicketGraphOptions,
  type ToolCallingModel
} from './createTicketGraph'
import type { TicketProvider } from '../../application/ticketProvider'

export type CreateTicketAgentDependencies = {
  model: ToolCallingModel
  prompt: ChatPromptTemplate
  provider: TicketProvider
}

/**
 * Public agent factory. Dependencies are explicit so the route can resolve
 * managed configuration while tests remain deterministic and network-free.
 */
export const createCreateTicketAgent = (
  dependencies: CreateTicketAgentDependencies,
  options: CreateTicketGraphOptions = {}
) =>
  createTicketGraph(
    dependencies.model,
    dependencies.prompt,
    dependencies.provider,
    options
  )

export type { CreateTicketAgentInput }
