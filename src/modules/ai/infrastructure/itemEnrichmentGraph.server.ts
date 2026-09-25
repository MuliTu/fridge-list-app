import '@tanstack/react-start/server-only'

import { END, START, StateGraph } from '@langchain/langgraph'
import { aiItemEnrichmentRequestSchema, aiItemEnrichmentResultSchema } from '../domain/aiSchemas'
import { groundItemEnrichment } from '../application/groundItemEnrichment'
import type { ItemEnricher } from './geminiItemEnricher.server'

const ItemEnrichmentState = aiItemEnrichmentRequestSchema.extend({
  modelResult: aiItemEnrichmentResultSchema,
  result: aiItemEnrichmentResultSchema
})

export const createItemEnrichmentGraph = (enricher: ItemEnricher) =>
  new StateGraph({ state: ItemEnrichmentState, input: aiItemEnrichmentRequestSchema })
    .addNode('enrich', async (state) => ({ modelResult: await enricher.enrich(state) }))
    .addNode('ground', (state) => ({ result: groundItemEnrichment(state.modelResult, state) }))
    .addEdge(START, 'enrich')
    .addEdge('enrich', 'ground')
    .addEdge('ground', END)
    .compile()
