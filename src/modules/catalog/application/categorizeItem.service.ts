import { ApplicationError, type RequestContext } from '../../shared'
import type { CategorizationProvider, CategorizationResult } from './categorizationProvider'

export const MAX_CATEGORIZATION_TEXT_LENGTH = 1_000

export class CategorizeItemService {
  constructor(private readonly provider: CategorizationProvider) {}

  async execute(context: RequestContext, input: unknown): Promise<CategorizationResult> {
    if (context.principal.kind !== 'user') {
      throw new ApplicationError('forbidden', 'Categorization requires a user principal')
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new ApplicationError('invalid_input', 'Categorization input must be an object')
    }
    const body = input as Record<string, unknown>
    const textCandidate = body.text
    const text = typeof textCandidate === 'string' ? textCandidate.trim() : ''
    if (!text || text.length > MAX_CATEGORIZATION_TEXT_LENGTH) {
      throw new ApplicationError('invalid_input', 'Categorization text is empty or too long')
    }
    return this.provider.categorize(text)
  }
}
