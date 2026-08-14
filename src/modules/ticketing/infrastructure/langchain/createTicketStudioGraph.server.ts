import { ChatOpenAI } from '@langchain/openai'

import { readCreateTicketConfig } from '../createTicketConfig.server'
import { createCompiledTicketGraph } from './createTicketGraph'
import { loadManagedCreateTicketPrompt } from './managedPrompt.server'
import { FakeTicketProvider } from '../providers/fakeTicketProvider'
import type { TicketProvider } from '../../application/ticketProvider'
import { TrelloTicketProvider } from '../providers/trelloTicketProvider'

const config = readCreateTicketConfig(process.env)

if (!config.enabled) {
  throw new Error(
    'LangGraph Studio requires AGENT_CREATE_TICKET_ENABLED=true'
  )
}

const createStudioProvider = (): TicketProvider => {
  if (config.provider.type === 'fake') return new FakeTicketProvider()

  if (process.env.LANGGRAPH_STUDIO_ALLOW_TRELLO !== 'true') {
    throw new Error(
      'LangGraph Studio refuses the Trello provider unless LANGGRAPH_STUDIO_ALLOW_TRELLO=true'
    )
  }

  return new TrelloTicketProvider(config.provider)
}

const prompt = await loadManagedCreateTicketPrompt(config.langChain)
const model = new ChatOpenAI({
  model: config.model.name,
  apiKey: config.model.openAiApiKey,
  temperature: 0
})

/**
 * LangGraph Agent Server / Studio entry point.
 *
 * Invoke with:
 * {
 *   "request": "Add sorting by aisle",
 *   "context": { "route": "/", "language": "en", "appVersion": "2.40.0" },
 *   "runId": "studio-test-1"
 * }
 */
export const graph = createCompiledTicketGraph(
  model,
  prompt,
  createStudioProvider()
)
