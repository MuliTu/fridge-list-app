import type { RecipeCandidate, RecipeRecord } from '../types'

type RecipeWithImageFallback = Pick<RecipeCandidate | RecipeRecord, 'title' | 'selectedProducts' | 'image'>

// A fixed placeholder never transmits household product names to an image service.
export const recipeDisplayImageUrl = (recipe: RecipeWithImageFallback): string =>
  recipe.image.url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="360"%3E%3Crect width="100%25" height="100%25" fill="%23e5e7eb"/%3E%3C/svg%3E'

export const recipeWithDisplayImage = <T extends RecipeWithImageFallback>(recipe: T): T => recipe
