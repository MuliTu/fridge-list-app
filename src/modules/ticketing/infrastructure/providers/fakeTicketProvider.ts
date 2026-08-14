import type { CreatedTicket, CreateTicketInput } from '../../domain/createTicketSchemas'
import type { CreateTicketProviderOptions, TicketProvider } from '../../application/ticketProvider'

const cloneInput = (input: CreateTicketInput): CreateTicketInput => ({
  ...input,
  labels: input.labels ? [...input.labels] : undefined
})

/**
 * Deterministic, network-free provider for local development and tests.
 *
 * IDs are scoped to an instance so every fresh provider starts with
 * `fake-ticket-1`. Inputs are snapshotted to keep assertions independent from
 * mutations made by callers after creation.
 */
export class FakeTicketProvider implements TicketProvider {
  readonly createdInputs: CreateTicketInput[] = []

  async createTicket(
    input: CreateTicketInput,
    options: CreateTicketProviderOptions = {}
  ): Promise<CreatedTicket> {
    options.signal?.throwIfAborted()

    const snapshot = cloneInput(input)
    this.createdInputs.push(snapshot)

    const id = `fake-ticket-${this.createdInputs.length}`
    return {
      id,
      url: `https://fake.invalid/tickets/${id}`,
      title: snapshot.title,
      description: snapshot.description
    }
  }
}
