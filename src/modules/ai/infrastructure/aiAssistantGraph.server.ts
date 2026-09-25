import '@tanstack/react-start/server-only'

import { END, START, StateGraph } from '@langchain/langgraph'
import { z } from 'zod'
import {
  aiAssistantRequestSchema,
  aiAssistantResultSchema,
  type AiAssistantResult
} from '../domain/aiSchemas'
import { groundAiResult, retrieveAiContext, type RetrievedAiContext } from '../application/aiRetrieval'
import type { AiRequestResponseLoggingMiddleware } from './aiRequestResponseMiddleware.server'

export interface AiAnalyzer {
  analyze(context: RetrievedAiContext): Promise<AiAssistantResult>
}

const RetrievedAiContextSchema = aiAssistantRequestSchema.extend({
  ignoredCorrectionCount: z.number().int().nonnegative()
})

// Runtime schemas are required here so LangGraph Studio can serialize the input.
// Type-only Annotation fields can appear in Studio while still producing an empty
// run state with older LangGraph CLI schema extraction.
const AiState = aiAssistantRequestSchema.extend({
  context: RetrievedAiContextSchema,
  result: aiAssistantResultSchema,
  middlewareStartedAt: z.number(),
  responseSummary: z.string()
})

const AiInput = aiAssistantRequestSchema

export const createAiAssistantGraph = (
  analyzer: AiAnalyzer,
  middleware: AiRequestResponseLoggingMiddleware,
  now: () => Date = () => new Date()
) =>
  new StateGraph({ state: AiState, input: AiInput })
    .addNode('retrieve', (state) => ({
      context: retrieveAiContext(aiAssistantRequestSchema.parse(state), now())
    }))
    .addNode('middleware_request', (state) => ({
      middlewareStartedAt: middleware.logRequest(state.context)
    }))
    .addNode('analyze', async (state) => {
      try {
        return {
          result: groundAiResult(await analyzer.analyze(state.context), state.context)
        }
      } catch (error) {
        middleware.logFailure(state.context.mode, error, state.middlewareStartedAt)
        throw error
      }
    })
    .addNode('middleware_response', (state) => ({
      responseSummary: middleware.summarizeResponse(state.result, state.middlewareStartedAt)
    }))
    .addEdge(START, 'retrieve')
    .addEdge('retrieve', 'middleware_request')
    .addEdge('middleware_request', 'analyze')
    .addEdge('analyze', 'middleware_response')
    .addEdge('middleware_response', END)
    .compile()
