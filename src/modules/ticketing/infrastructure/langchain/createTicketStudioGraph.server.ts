import { ChatOpenAI } from '@langchain/openai'
import { AIMessage } from '@langchain/core/messages'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'

import createTicketStudioSystemPrompt from '../../../../prompts/agents/createTicketStudioPrompts/system.md?raw'
import { readCreateTicketConfig } from '../createTicketConfig.server'
import { createCompiledTicketGraph, type ToolCallingModel } from './createTicketGraph'
import { loadManagedCreateTicketPrompt } from './managedPrompt.server'
import { FakeTicketProvider } from '../providers/fakeTicketProvider'
import type { TicketProvider } from '../../application/ticketProvider'
import { TrelloTicketProvider } from '../providers/trelloTicketProvider'

let config
try {
  config = readCreateTicketConfig(process.env)
} catch {
  config = null
}

const createLocalFallbackGraph = () => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', createTicketStudioSystemPrompt]
  ])
  const model = {
    bindTools: () =>
      new RunnableLambda({
        func: async () =>
          new AIMessage({
            content: '',
            tool_calls: [
              {
                name: 'create_ticket',
                args: {
                  title: 'Local fallback ticket',
                  description: 'Created by the local LangGraph Studio fallback.'
                },
                id: 'local-fallback-call',
                type: 'tool_call'
              }
            ]
          })
      })
  }
  return createCompiledTicketGraph(model, prompt, new FakeTicketProvider())
}

const shouldUseLocalFallback = !config?.enabled

const createStudioProvider = (): TicketProvider => {
  if (!config) return new FakeTicketProvider()
  if (config.provider.type === 'fake') return new FakeTicketProvider()

  if (process.env.LANGGRAPH_STUDIO_ALLOW_TRELLO !== 'true') {
    throw new Error(
      'LangGraph Studio refuses the Trello provider unless LANGGRAPH_STUDIO_ALLOW_TRELLO=true'
    )
  }

  return new TrelloTicketProvider(config.provider)
}

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
export const graph = shouldUseLocalFallback
  ? createLocalFallbackGraph()
  : createCompiledTicketGraph(
      new ChatOpenAI({
        model: config!.model.name,
        apiKey: config!.model.openAiApiKey,
        temperature: 0
      }) as unknown as ToolCallingModel,
      await loadManagedCreateTicketPrompt(config!.langChain),
      createStudioProvider()
    )
