import {
  AIMessage,
  HumanMessage,
  type BaseMessage
} from '@langchain/core/messages'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'

import {
  CreateTicketAgentError,
  CreateTicketModelError,
  createCompiledTicketGraph,
  createTicketGraph,
  type ToolCallingModel
} from '../../../../../src/modules/ticketing/infrastructure/langchain/createTicketGraph'
import { FakeTicketProvider } from '../../../../../src/modules/ticketing/infrastructure/providers/fakeTicketProvider'
import type { TicketProvider } from '../../../../../src/modules/ticketing/application/ticketProvider'

const providerTicket = {
  id: 'trusted-ticket',
  url: 'https://tickets.example/trusted-ticket',
  title: 'Trusted title',
  description: 'Trusted description'
}

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'Create exactly one ticket for {request}. Context: {context}']
])

const toolCall = (
  overrides: Partial<{
    name: string
    args: Record<string, unknown>
    id: string
  }> = {}
) => ({
  name: 'create_ticket',
  args: {
    title: 'Model title',
    description: 'Model description'
  },
  id: 'call-1',
  type: 'tool_call' as const,
  ...overrides
})

const createModel = (
  invoke: (messages: BaseMessage[]) => Promise<BaseMessage>
): ToolCallingModel & { bindTools: jest.Mock } => {
  const bindTools = jest.fn(() => new RunnableLambda({ func: invoke }))
  return { bindTools } as ToolCallingModel & { bindTools: jest.Mock }
}

const input = {
  request: 'Add shared shopping lists',
  context: { route: '/', language: 'en' },
  runId: 'run-1'
}

describe('createTicketGraph', () => {
  it('creates exactly one ticket and returns only the trusted provider result', async () => {
    const observedMessages: BaseMessage[][] = []
    const model = createModel(async (messages) => {
      observedMessages.push(messages)
      return new AIMessage({
        content: 'I created https://untrusted.invalid/fake',
        tool_calls: [toolCall()]
      })
    })
    const provider: TicketProvider = {
      createTicket: jest.fn().mockResolvedValue(providerTicket)
    }
    const agent = createTicketGraph(model, prompt, provider)

    await expect(agent(input)).resolves.toEqual({
      ticket: providerTicket,
      runId: 'run-1'
    })
    expect(provider.createTicket).toHaveBeenCalledTimes(1)
    expect(model.bindTools).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'create_ticket' })],
      { tool_choice: 'create_ticket' }
    )
    expect(observedMessages[0][0]._getType()).toBe('system')
    expect(observedMessages[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: 'Add shared shopping lists' })
      ])
    )
  })

  it('fails closed when the model does not request a ticket', async () => {
    const model = createModel(async () => new AIMessage('No tool needed.'))
    const provider: TicketProvider = {
      createTicket: jest.fn().mockResolvedValue(providerTicket)
    }

    await expect(createTicketGraph(model, prompt, provider)(input)).rejects.toMatchObject({
      code: 'AGENT_ERROR',
      reason: 'no_ticket',
      message: 'Create-ticket agent failed'
    })
    expect(provider.createTicket).not.toHaveBeenCalled()
  })

  it('rejects duplicate tool calls before any mutation', async () => {
    const model = createModel(
      async () =>
        new AIMessage({
          content: '',
          tool_calls: [toolCall(), toolCall({ id: 'call-2' })]
        })
    )
    const provider: TicketProvider = {
      createTicket: jest.fn().mockResolvedValue(providerTicket)
    }

    await expect(createTicketGraph(model, prompt, provider)(input)).rejects.toMatchObject({
      code: 'AGENT_ERROR',
      reason: 'duplicate_tool'
    })
    expect(provider.createTicket).not.toHaveBeenCalled()
  })

  it('rejects unexpected tools and malformed model messages', async () => {
    const provider: TicketProvider = {
      createTicket: jest.fn().mockResolvedValue(providerTicket)
    }
    const cases = [
      createModel(
        async () =>
          new AIMessage({
            content: '',
            tool_calls: [toolCall({ name: 'delete_everything' })]
          })
      ),
      createModel(async () => new HumanMessage('not an AI response'))
    ]

    await expect(createTicketGraph(cases[0], prompt, provider)(input)).rejects.toMatchObject({
      reason: 'unexpected_tool'
    })
    await expect(createTicketGraph(cases[1], prompt, provider)(input)).rejects.toMatchObject({
      reason: 'invalid_model_output'
    })
    expect(provider.createTicket).not.toHaveBeenCalled()
  })

  it('maps model failures without leaking their details', async () => {
    const model = createModel(async () => {
      throw new Error('openai-secret model output')
    })
    const provider: TicketProvider = {
      createTicket: jest.fn().mockResolvedValue(providerTicket)
    }

    const error = await createTicketGraph(model, prompt, provider)(input).catch(
      (cause) => cause
    )
    expect(error).toBeInstanceOf(CreateTicketModelError)
    expect(error).toMatchObject({
      code: 'MODEL_ERROR',
      message: 'Ticket model invocation failed'
    })
    expect(String(error)).not.toContain('openai-secret')
    expect(provider.createTicket).not.toHaveBeenCalled()
  })

  it('bounds a model that ignores cancellation with a safe timeout', async () => {
    const model = createModel(async () => new Promise(() => {}))
    const provider: TicketProvider = {
      createTicket: jest.fn().mockResolvedValue(providerTicket)
    }

    await expect(
      createTicketGraph(model, prompt, provider, { modelTimeoutMs: 5 })(input)
    ).rejects.toEqual(new CreateTicketModelError())
    expect(provider.createTicket).not.toHaveBeenCalled()
  })

  it('maps the LangGraph recursion bound to a safe loop-limit failure', async () => {
    const model = createModel(
      async () => new AIMessage({ content: '', tool_calls: [toolCall()] })
    )
    const provider: TicketProvider = {
      createTicket: jest.fn().mockResolvedValue(providerTicket)
    }

    await expect(
      createTicketGraph(model, prompt, provider, { recursionLimit: 1 })(input)
    ).rejects.toEqual(new CreateTicketAgentError('loop_limit'))
    expect(provider.createTicket).not.toHaveBeenCalled()
  })

  it('does not persist tool invocation state between requests', async () => {
    const model = createModel(
      async () => new AIMessage({ content: '', tool_calls: [toolCall()] })
    )
    const provider: TicketProvider = {
      createTicket: jest.fn().mockResolvedValue(providerTicket)
    }
    const agent = createTicketGraph(model, prompt, provider)

    await agent(input)
    await agent({ ...input, runId: 'run-2' })
    expect(provider.createTicket).toHaveBeenCalledTimes(2)
  })

  it('reuses the exported Studio graph across independent runs', async () => {
    const model = createModel(
      async () => new AIMessage({ content: '', tool_calls: [toolCall()] })
    )
    const provider: TicketProvider = {
      createTicket: jest.fn().mockResolvedValue(providerTicket)
    }
    const graph = createCompiledTicketGraph(model, prompt, provider)
    const initialState = (runId: string) => ({
      messages: [],
      request: input.request,
      context: input.context,
      runId,
      ticketCreated: false,
      ticket: undefined,
      pendingToolCall: undefined
    })

    await expect(graph.invoke(initialState('studio-run-1'))).resolves.toMatchObject({
      ticket: providerTicket,
      runId: 'studio-run-1'
    })
    await expect(graph.invoke(initialState('studio-run-2'))).resolves.toMatchObject({
      ticket: providerTicket,
      runId: 'studio-run-2'
    })
    expect(provider.createTicket).toHaveBeenCalledTimes(2)
  })

  it('runs end-to-end with the deterministic fake provider and no network', async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = jest.fn()
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchSpy
    })
    const model = createModel(
      async () => new AIMessage({ content: '', tool_calls: [toolCall()] })
    )

    try {
      await expect(
        createTicketGraph(model, prompt, new FakeTicketProvider())(input)
      ).resolves.toEqual({
        ticket: {
          id: 'fake-ticket-1',
          url: 'https://fake.invalid/tickets/fake-ticket-1',
          title: 'Model title',
          description: 'Model description'
        },
        runId: 'run-1'
      })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      if (originalFetch) {
        globalThis.fetch = originalFetch
      } else {
        delete (globalThis as { fetch?: typeof fetch }).fetch
      }
    }
  })
})
