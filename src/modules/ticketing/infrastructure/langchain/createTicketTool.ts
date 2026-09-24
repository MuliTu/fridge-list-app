import { tool } from '@langchain/core/tools'
import {
  createdTicketSchema,
  createTicketInputSchema,
  type CreatedTicket
} from '../../domain/createTicketSchemas'
import type { TicketProvider } from '../../application/ticketProvider'

export const CREATE_TICKET_TOOL_NAME = 'create_ticket'
export const DEFAULT_CREATE_TICKET_TIMEOUT_MS = 10_000

export type CreateTicketToolOptions = {
  timeoutMs?: number
}

export class CreateTicketToolError extends Error {
  readonly code = 'TICKET_PROVIDER_ERROR'

  constructor() {
    super('Ticket creation failed')
    this.name = 'CreateTicketToolError'
  }
}

export class CreateTicketAlreadyInvokedError extends Error {
  readonly code = 'AGENT_ERROR'

  constructor() {
    super('Ticket creation has already been attempted')
    this.name = 'CreateTicketAlreadyInvokedError'
  }
}

/**
 * Creates one tool instance for one graph run.
 *
 * Invocation state is intentionally closed over by the factory. A second call
 * is rejected even when the first call failed, because a provider failure can
 * be ambiguous and retrying could create a duplicate ticket.
 */
export const createTicketTool = (
  provider: TicketProvider,
  options: CreateTicketToolOptions = {}
) => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CREATE_TICKET_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('create_ticket timeoutMs must be a positive number')
  }

  let invoked = false

  return tool(
    async (input): Promise<CreatedTicket> => {
      if (invoked) {
        throw new CreateTicketAlreadyInvokedError()
      }
      invoked = true

      const controller = new AbortController()
      let timeout: ReturnType<typeof setTimeout> | undefined

      try {
        const timeoutFailure = new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort()
            reject(new CreateTicketToolError())
          }, timeoutMs)
        })

        const providerResult = provider.createTicket(input, {
          signal: controller.signal
        })
        const result = await Promise.race([providerResult, timeoutFailure])
        const normalized = createdTicketSchema.safeParse(result)
        if (!normalized.success) {
          throw new CreateTicketToolError()
        }
        return normalized.data
      } catch (error) {
        if (error instanceof CreateTicketAlreadyInvokedError) throw error
        if (error instanceof CreateTicketToolError) throw error
        throw new CreateTicketToolError()
      } finally {
        if (timeout !== undefined) clearTimeout(timeout)
      }
    },
    {
      name: CREATE_TICKET_TOOL_NAME,
      description:
        'Create exactly one product ticket from a validated title and description.',
      schema: createTicketInputSchema
    }
  )
}
