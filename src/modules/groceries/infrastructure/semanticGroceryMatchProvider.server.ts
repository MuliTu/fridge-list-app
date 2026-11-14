import '@tanstack/react-start/server-only'

import { PRODUCT_INTEGRITY_GUARDIAN_PROMPT } from './productIntegrityGuardianPrompt.server'
import type { SemanticGroceryMatchProvider } from '../application/semanticGroceryMatch.service'

type StructuredSemanticModel = {
  invoke(input: unknown): Promise<unknown>
}

export class StructuredModelSemanticGroceryMatchProvider implements SemanticGroceryMatchProvider {
  constructor(private readonly model: StructuredSemanticModel) {}

  async evaluate(input: Parameters<SemanticGroceryMatchProvider['evaluate']>[0]): Promise<unknown> {
    const { query, candidates, guardian } = input
    return this.model.invoke([
      { role: 'system', content: PRODUCT_INTEGRITY_GUARDIAN_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          operation: guardian?.operation ?? 'add',
          language: guardian?.language ?? 'he',
          candidatesComplete: input.candidatesComplete ?? true,
          allowedCategories: input.allowedCategories ?? [],
          incomingItem: guardian?.operation === 'update'
            ? { id: guardian.itemId, name: query, requestedFields: input.requestedFields }
            : { ...guardian?.details, name: query },
          existingItems: candidates.map(({ id, name, category, quantity, unit, notes }) =>
            ({ id, name, category, quantity, unit, notes }))
        })
      }
    ])
  }
}

export class UnavailableSemanticGroceryMatchProvider implements SemanticGroceryMatchProvider {
  async evaluate(): Promise<never> {
    throw new Error('Semantic grocery provider is not configured')
  }
}
