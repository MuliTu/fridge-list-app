import { normalizeName } from '../../../lib/normalizeName'
import type {
  AiEnrichedItem,
  AiItemEnrichmentRequest,
  AiItemEnrichmentResult
} from '../domain/aiSchemas'

export const groundItemEnrichment = (
  result: AiItemEnrichmentResult,
  request: AiItemEnrichmentRequest
): AiItemEnrichmentResult => {
  const categories = new Map(request.categories.map((category) => [normalizeName(category), category]))
  const returnedById = new Map(result.items.map((item) => [item.id, item]))

  return {
    items: request.items.map((input): AiEnrichedItem => {
      const returned = returnedById.get(input.id)
      if (!returned) {
        return {
          id: input.id,
          originalName: input.name,
          correctedName: input.name,
          category: request.categories[0],
          categoryStatus: 'existing',
          correctionReason: null
        }
      }

      const exactExistingCategory = categories.get(normalizeName(returned.category))
      const correctedName = returned.correctedName.trim() || input.name
      return {
        id: input.id,
        originalName: input.name,
        correctedName,
        category: exactExistingCategory ?? returned.category,
        categoryStatus: exactExistingCategory ? 'existing' : 'suggested',
        correctionReason:
          normalizeName(correctedName) === normalizeName(input.name)
            ? null
            : returned.correctionReason || null
      }
    })
  }
}
