import type { RecipeCandidate, RecipeRecord } from '../types'

type RecipeWithImageFallback = Pick<RecipeCandidate | RecipeRecord, 'title' | 'selectedProducts' | 'image'>

// A local illustration keeps missing photos intentional without sending household
// product names to an image service.
const recipePlaceholder = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="#1c2b23"/><circle cx="320" cy="320" r="170" fill="#26372c"/><circle cx="320" cy="320" r="136" fill="none" stroke="#4e6b55" stroke-width="2"/><g fill="none" stroke="#b7efb2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M248 306h144v62a25 25 0 0 1-25 25h-94a25 25 0 0 1-25-25z"/><path d="M236 306h168M270 292q50-64 100 0M320 270v-13M248 330h-17q-15 0-15 16t15 16h17M392 330h17q15 0 15 16t-15 16h-17M292 241q-12-16 0-30M344 241q-12-16 0-30"/></g><path d="M425 180q-12-59 44-67 10 45-44 67z" fill="#6e996d"/><path d="M186 442q-35 8-49-29 40-18 49 29z" fill="#c29864"/></svg>'
)}`

export const recipeDisplayImageUrl = (recipe: RecipeWithImageFallback): string =>
  recipe.image.url || recipePlaceholder

export const recipeWithDisplayImage = <T extends RecipeWithImageFallback>(recipe: T): T => recipe
