import { z } from 'zod'
import { createdTicketSchema, type CreatedTicket, type CreateTicketInput } from '../../domain/createTicketSchemas'
import type { CreateTicketProviderOptions, TicketProvider } from '../../application/ticketProvider'

const TRELLO_CREATE_CARD_URL = 'https://api.trello.com/1/cards'

const trelloCardSchema = z.object({
  id: z.string().trim().min(1),
  url: z.string().url(),
  name: z.string().trim().min(1),
  desc: z.string()
})

export type TrelloTicketProviderConfig = {
  apiKey: string
  apiToken: string
  listId: string
}

export class TrelloTicketProviderError extends Error {
  readonly code = 'TICKET_PROVIDER_ERROR'

  constructor(readonly status?: number) {
    super('Ticket provider request failed')
    this.name = 'TrelloTicketProviderError'
  }
}

/**
 * Trello adapter for the provider-neutral ticket boundary.
 *
 * Credentials are sent in the form body rather than the URL so they are less
 * likely to appear in HTTP access logs. All upstream errors are replaced with
 * a safe error that contains neither response content nor credentials.
 */
export class TrelloTicketProvider implements TicketProvider {
  constructor(
    private readonly config: TrelloTicketProviderConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async createTicket(
    input: CreateTicketInput,
    options: CreateTicketProviderOptions = {}
  ): Promise<CreatedTicket> {
    const body = new URLSearchParams({
      key: this.config.apiKey,
      token: this.config.apiToken,
      idList: this.config.listId,
      name: input.title,
      desc: input.description
    })

    let response: Response
    try {
      response = await this.fetchImpl(TRELLO_CREATE_CARD_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        },
        body,
        signal: options.signal
      })
    } catch {
      throw new TrelloTicketProviderError()
    }

    if (!response.ok) {
      throw new TrelloTicketProviderError(response.status)
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new TrelloTicketProviderError(response.status)
    }

    const card = trelloCardSchema.safeParse(payload)
    if (!card.success) {
      throw new TrelloTicketProviderError(response.status)
    }

    const normalized = createdTicketSchema.safeParse({
      id: card.data.id,
      url: card.data.url,
      title: card.data.name,
      description: card.data.desc
    })
    if (!normalized.success) {
      throw new TrelloTicketProviderError(response.status)
    }

    return normalized.data
  }
}
