import { ToolInputParsingException } from '@langchain/core/tools'
import type { TicketProvider } from '../../../../../src/modules/ticketing/application/ticketProvider'
import {
  CreateTicketAlreadyInvokedError,
  CreateTicketToolError,
  createTicketTool
} from '../../../../../src/modules/ticketing/infrastructure/langchain/createTicketTool'

const ticket = {
  id: 'ticket-1',
  url: 'https://tickets.example/ticket-1',
  title: 'Shared lists',
  description: 'Let household members share a list.'
}

describe('createTicketTool', () => {
  it('validates input, invokes the provider, and returns its normalized ticket', async () => {
    const provider: TicketProvider = {
      createTicket: jest.fn().mockResolvedValue(ticket)
    }
    const createTicket = createTicketTool(provider)

    await expect(
      createTicket.invoke({
        title: '  Shared lists  ',
        description: '  Let household members share a list.  ',
        labels: ['  feature  '],
        priority: 'high'
      })
    ).resolves.toEqual(ticket)
    expect(provider.createTicket).toHaveBeenCalledWith(
      {
        title: 'Shared lists',
        description: 'Let household members share a list.',
        labels: ['feature'],
        priority: 'high'
      },
      { signal: expect.any(AbortSignal) }
    )
  })

  it.each([
    { title: '', description: 'Description' },
    { title: 'x'.repeat(121), description: 'Description' },
    { title: 'Title', description: '' },
    { title: 'Title', description: 'Description', priority: 'urgent' }
  ])('rejects invalid arguments before invoking the provider %#', async (input) => {
    const provider: TicketProvider = {
      createTicket: jest.fn().mockResolvedValue(ticket)
    }
    const createTicket = createTicketTool(provider)

    await expect(createTicket.invoke(input as never)).rejects.toBeInstanceOf(
      ToolInputParsingException
    )
    expect(provider.createTicket).not.toHaveBeenCalled()
  })

  it('aborts and safely rejects a provider that exceeds the timeout', async () => {
    let receivedSignal: AbortSignal | undefined
    const provider: TicketProvider = {
      createTicket: jest.fn((_input, options) => {
        receivedSignal = options?.signal
        return new Promise(() => {})
      })
    }
    const createTicket = createTicketTool(provider, { timeoutMs: 5 })

    await expect(
      createTicket.invoke({ title: 'Title', description: 'Description' })
    ).rejects.toEqual(new CreateTicketToolError())
    expect(receivedSignal?.aborted).toBe(true)
  })

  it('maps provider details and malformed provider results to safe errors', async () => {
    const providers: TicketProvider[] = [
      {
        createTicket: jest
          .fn()
          .mockRejectedValue(new Error('secret-api-key secret-api-token'))
      },
      {
        createTicket: jest.fn().mockResolvedValue({
          ...ticket,
          url: 'malformed-url'
        })
      }
    ]

    for (const provider of providers) {
      const createTicket = createTicketTool(provider)
      const error = await createTicket
        .invoke({ title: 'Title', description: 'Description' })
        .catch((cause) => cause)

      expect(error).toBeInstanceOf(CreateTicketToolError)
      expect(error).toMatchObject({
        code: 'TICKET_PROVIDER_ERROR',
        message: 'Ticket creation failed'
      })
      expect(error.message).not.toContain('secret-api-key')
      expect(error.message).not.toContain('secret-api-token')
    }
  })

  it('allows at most one provider attempt per tool instance', async () => {
    const provider: TicketProvider = {
      createTicket: jest.fn().mockResolvedValue(ticket)
    }
    const createTicket = createTicketTool(provider)
    const input = { title: 'Title', description: 'Description' }

    await createTicket.invoke(input)
    await expect(createTicket.invoke(input)).rejects.toBeInstanceOf(
      CreateTicketAlreadyInvokedError
    )
    expect(provider.createTicket).toHaveBeenCalledTimes(1)
  })

  it('does not retry after an uncertain provider failure', async () => {
    const provider: TicketProvider = {
      createTicket: jest.fn().mockRejectedValue(new Error('connection dropped'))
    }
    const createTicket = createTicketTool(provider)
    const input = { title: 'Title', description: 'Description' }

    await expect(createTicket.invoke(input)).rejects.toBeInstanceOf(CreateTicketToolError)
    await expect(createTicket.invoke(input)).rejects.toBeInstanceOf(
      CreateTicketAlreadyInvokedError
    )
    expect(provider.createTicket).toHaveBeenCalledTimes(1)
  })
})
