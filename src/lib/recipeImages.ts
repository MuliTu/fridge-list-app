import type { RecipeCandidate, RecipeRecord } from '../types'

type RecipeWithImageFallback = Pick<RecipeCandidate | RecipeRecord, 'title' | 'selectedProducts' | 'image'>

const fallbackTerms = (recipe: RecipeWithImageFallback): string => {
  const productNames = recipe.selectedProducts
    .slice(0, 3)
    .map((product) => product.name)
    .join(' ')
  return encodeURIComponent(`${recipe.title} ${productNames} meal`.trim())
}

export const recipeDisplayImageUrl = (recipe: RecipeWithImageFallback): string =>
  recipe.image.url || `https://source.unsplash.com/featured/900x600/?${fallbackTerms(recipe)}`

export const recipeWithDisplayImage = <T extends RecipeWithImageFallback>(recipe: T): T => ({
  ...recipe,
  image: {
    ...recipe.image,
    url: recipeDisplayImageUrl(recipe)
  }
})
