import { createFileRoute } from '@tanstack/react-router'

import { getTicketingServer } from '../../../modules/composition.server'

export type { CreateTicketRouteDependencies } from '../../../modules/ticketing/server'
import type { CreateTicketRouteDependencies } from '../../../modules/ticketing/server'

export const createCreateTicketPostHandler = (
  overrides: Partial<CreateTicketRouteDependencies> = {}
) => getTicketingServer().createCreateTicketPostHandler(overrides)

export const Route = createFileRoute('/api/agent/create-ticket')({
  server: {
    handlers: {
      POST: createCreateTicketPostHandler()
    }
  }
})
