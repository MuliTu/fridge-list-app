import {
  BaseMessage,
  HumanMessage,
  ToolMessage,
  isAIMessage
} from '@langchain/core/messages'
import type { ChatPromptTemplate } from '@langchain/core/prompts'
import type { Runnable } from '@langchain/core/runnables'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'

import type { CreatedTicket, CreateTicketInput } from '../../domain/createTicketSchemas'
import {
  CREATE_TICKET_TOOL_NAME,
  CreateTicketAlreadyInvokedError,
  createTicketTool,
  type CreateTicketToolOptions
} from './createTicketTool'
import type { TicketProvider } from '../../application/ticketProvider'

export const DEFAULT_CREATE_TICKET_RECURSION_LIMIT = 8
export const DEFAULT_CREATE_TICKET_MODEL_TIMEOUT_MS = 30_000

export type CreateTicketRequestContext = {
  route?: string
  language?: string
  appVersion?: string
}

export type CreateTicketAgentInput = {
  request: string
  context?: CreateTicketRequestContext
  runId: string
}

export type CreateTicketAgentResult = {
  ticket: CreatedTicket
  runId: string
}

type PendingToolCall = {
  name: string
  args: Record<string, unknown>
  id?: string
}

export type ToolCallingModel = {
  bindTools(
    tools: DynamicStructuredTool[],
    options?: { tool_choice?: string }
  ): Runnable<BaseMessage[], BaseMessage>
}

export class CreateTicketModelError extends Error {
  readonly code = 'MODEL_ERROR'

  constructor() {
    super('Ticket model invocation failed')
    this.name = 'CreateTicketModelError'
  }
}

export type CreateTicketAgentFailureReason =
  | 'no_ticket'
  | 'duplicate_tool'
  | 'unexpected_tool'
  | 'invalid_model_output'
  | 'loop_limit'

export class CreateTicketAgentError extends Error {
  readonly code = 'AGENT_ERROR'

  constructor(readonly reason: CreateTicketAgentFailureReason) {
    super('Create-ticket agent failed')
    this.name = 'CreateTicketAgentError'
  }
}

const CreateTicketState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  }),
  request: Annotation<string>(),
  context: Annotation<CreateTicketRequestContext | undefined>(),
  runId: Annotation<string>(),
  ticketCreated: Annotation<boolean>(),
  ticket: Annotation<CreatedTicket | undefined>(),
  pendingToolCall: Annotation<PendingToolCall | undefined>()
})

export type CreateTicketGraphOptions = CreateTicketToolOptions & {
  recursionLimit?: number
  modelTimeoutMs?: number
}

const promptVariables = (
  request: string,
  context: CreateTicketRequestContext | undefined
): Record<string, string> => ({
  request,
  context: JSON.stringify(context ?? {}),
  route: context?.route ?? '',
  language: context?.language ?? '',
  appVersion: context?.appVersion ?? ''
})

/**
 * Builds one isolated graph for one request. It has no checkpointer or store,
 * and its create_ticket tool instance owns the one-attempt mutation guard.
 */
export const createCompiledTicketGraph = (
  model: ToolCallingModel,
  prompt: ChatPromptTemplate,
  provider: TicketProvider,
  options: CreateTicketGraphOptions = {}
) => {
  const recursionLimit =
    options.recursionLimit ?? DEFAULT_CREATE_TICKET_RECURSION_LIMIT
  if (!Number.isInteger(recursionLimit) || recursionLimit <= 0) {
    throw new TypeError('recursionLimit must be a positive integer')
  }
  const modelTimeoutMs =
    options.modelTimeoutMs ?? DEFAULT_CREATE_TICKET_MODEL_TIMEOUT_MS
  if (!Number.isFinite(modelTimeoutMs) || modelTimeoutMs <= 0) {
    throw new TypeError('modelTimeoutMs must be a positive number')
  }

  const ticketToolDefinition = createTicketTool(provider, {
    timeoutMs: options.timeoutMs
  })
  const modelWithTools = model.bindTools([ticketToolDefinition], {
    tool_choice: CREATE_TICKET_TOOL_NAME
  })

  const prepareInput = async (state: typeof CreateTicketState.State) => {
    let promptValue
    try {
      promptValue = await prompt.invoke(
        promptVariables(state.request, state.context)
      )
    } catch {
      throw new CreateTicketAgentError('invalid_model_output')
    }

    const messages = promptValue.toChatMessages()
    if (!messages.some((message) => message._getType() === 'human')) {
      messages.push(new HumanMessage(state.request))
    }
    return { messages }
  }

  const callModel = async (state: typeof CreateTicketState.State) => {
    let response: BaseMessage
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const timeoutFailure = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort()
          reject(new CreateTicketModelError())
        }, modelTimeoutMs)
      })
      response = await Promise.race([
        modelWithTools.invoke(state.messages, { signal: controller.signal }),
        timeoutFailure
      ])
    } catch {
      throw new CreateTicketModelError()
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }

    if (!isAIMessage(response)) {
      throw new CreateTicketAgentError('invalid_model_output')
    }
    if (response.invalid_tool_calls?.length) {
      throw new CreateTicketAgentError('invalid_model_output')
    }

    const toolCalls = response.tool_calls ?? []
    if (toolCalls.length === 0) {
      throw new CreateTicketAgentError('no_ticket')
    }
    if (toolCalls.length > 1) {
      throw new CreateTicketAgentError('duplicate_tool')
    }
    if (toolCalls[0].name !== CREATE_TICKET_TOOL_NAME) {
      throw new CreateTicketAgentError('unexpected_tool')
    }

    return {
      messages: [response],
      pendingToolCall: toolCalls[0]
    }
  }

  const invokeTool = async (state: typeof CreateTicketState.State) => {
    if (state.ticketCreated) {
      throw new CreateTicketAgentError('duplicate_tool')
    }
    const toolCall = state.pendingToolCall
    if (!toolCall) {
      throw new CreateTicketAgentError('no_ticket')
    }

    let ticket: CreatedTicket
    try {
      // The Agent Server reuses an exported compiled graph across Studio runs.
      // Create the stateful one-attempt tool per node execution so one completed
      // Studio run cannot poison the next run's invocation guard.
      const ticketTool = createTicketTool(provider, {
        timeoutMs: options.timeoutMs
      })
      ticket = await ticketTool.invoke(toolCall.args as CreateTicketInput)
    } catch (error) {
      if (error instanceof CreateTicketAlreadyInvokedError) {
        throw new CreateTicketAgentError('duplicate_tool')
      }
      throw error
    }

    return {
      messages: [
        new ToolMessage({
          content: JSON.stringify(ticket),
          name: CREATE_TICKET_TOOL_NAME,
          tool_call_id: toolCall.id ?? 'create-ticket'
        })
      ],
      ticket,
      ticketCreated: true,
      pendingToolCall: undefined
    }
  }

  const finalize = (state: typeof CreateTicketState.State) => {
    if (!state.ticketCreated || !state.ticket) {
      throw new CreateTicketAgentError('no_ticket')
    }
    return {}
  }

  return new StateGraph(CreateTicketState)
    .addNode('prepareInput', prepareInput)
    .addNode('model', callModel)
    .addNode('createTicket', invokeTool)
    .addNode('finalize', finalize)
    .addEdge(START, 'prepareInput')
    .addEdge('prepareInput', 'model')
    .addEdge('model', 'createTicket')
    .addEdge('createTicket', 'finalize')
    .addEdge('finalize', END)
    .compile()
}

const invokeIsolatedTicketGraph = (
  model: ToolCallingModel,
  prompt: ChatPromptTemplate,
  provider: TicketProvider,
  options: CreateTicketGraphOptions
) => {
  const graph = createCompiledTicketGraph(model, prompt, provider, options)
  const recursionLimit =
    options.recursionLimit ?? DEFAULT_CREATE_TICKET_RECURSION_LIMIT

  return async (input: CreateTicketAgentInput): Promise<CreateTicketAgentResult> => {
    try {
      const state = await graph.invoke(
        {
          messages: [],
          request: input.request,
          context: input.context,
          runId: input.runId,
          ticketCreated: false,
          ticket: undefined,
          pendingToolCall: undefined
        },
        { recursionLimit }
      )

      if (!state.ticketCreated || !state.ticket) {
        throw new CreateTicketAgentError('no_ticket')
      }
      return { ticket: state.ticket, runId: state.runId }
    } catch (error) {
      if (error instanceof Error && error.name === 'GraphRecursionError') {
        throw new CreateTicketAgentError('loop_limit')
      }
      if (
        error instanceof CreateTicketAgentError ||
        error instanceof CreateTicketModelError ||
        (error instanceof Error && 'code' in error)
      ) {
        throw error
      }
      throw new CreateTicketAgentError('invalid_model_output')
    }
  }
}

/**
 * The returned agent is reusable, but each invocation receives a fresh graph
 * and tool guard so execution state can never cross request boundaries.
 */
export const createTicketGraph = (
  model: ToolCallingModel,
  prompt: ChatPromptTemplate,
  provider: TicketProvider,
  options: CreateTicketGraphOptions = {}
) => (input: CreateTicketAgentInput) =>
  invokeIsolatedTicketGraph(model, prompt, provider, options)(input)
