import type { CreatedTicket, CreateTicketInput } from '../domain/createTicketSchemas'

export type CreateTicketProviderOptions = {
  signal?: AbortSignal
}

/**
 * Provider-neutral boundary for the create-ticket tool.
 *
 * Implementations normalize their provider-specific response to CreatedTicket
 * and reject when creation fails or the response cannot be normalized.
 */
export type TicketProvider = {
  createTicket(
    input: CreateTicketInput,
    options?: CreateTicketProviderOptions
  ): Promise<CreatedTicket>
}
