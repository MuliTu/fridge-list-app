import '@tanstack/react-start/server-only'

import type { SemanticGroceryMatchProvider } from '../application/semanticGroceryMatch.service'

type StructuredSemanticModel = {
  invoke(input: unknown): Promise<unknown>
}

export class StructuredModelSemanticGroceryMatchProvider implements SemanticGroceryMatchProvider {
  constructor(private readonly model: StructuredSemanticModel) {}

  async evaluate(input: Parameters<SemanticGroceryMatchProvider['evaluate']>[0]): Promise<unknown> {
    return this.model.invoke([
      {
        role: 'system',
        content: [
          'Classify a grocery name against only the supplied selected-list candidates.',
          'Use exact for the same product, similar for a close substitute or corrected spelling, and related for a meaningfully related grocery.',
          'Set distinct=true and return no selections only when no candidate is a useful match.',
          'Never invent IDs. Return at most eight selections.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({ query: input.query, candidates: input.candidates })
      }
    ])
  }
}

export class UnavailableSemanticGroceryMatchProvider implements SemanticGroceryMatchProvider {
  async evaluate(): Promise<never> {
    throw new Error('Semantic grocery provider is not configured')
  }
}
