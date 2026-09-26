import { ApplicationError } from '../../../shared'
import type { RecipeCandidateInput, RecipeProductInput } from '../../domain/recipeSchemas'

const normalize = (value: string): string =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')

const productNameSet = (products: readonly RecipeProductInput[]): Set<string> =>
  new Set(products.flatMap((product) => {
    const name = normalize(product.name)
    return [name, name.replace(/s$/, '')].filter(Boolean)
  }))

const isSelectedProductIngredient = (
  ingredientName: string,
  selectedNames: Set<string>
): boolean => {
  const normalized = normalize(ingredientName)
  if (selectedNames.has(normalized) || selectedNames.has(normalized.replace(/s$/, ''))) {
    return true
  }
  return Array.from(selectedNames).some(
    (productName) =>
      normalized.includes(productName) || productName.includes(normalized)
  )
}

export const assertRecipeUsesOnlySelectedProducts = (
  recipe: RecipeCandidateInput,
  selectedProducts: readonly RecipeProductInput[]
): void => {
  const selectedNames = productNameSet(selectedProducts)
  const missing = recipe.ingredients.filter((ingredient) => {
    return !isSelectedProductIngredient(ingredient.name, selectedNames)
  })

  if (missing.length > 0) {
    throw new ApplicationError(
      'invalid_input',
      `Recipe requires unselected ingredients: ${missing.map((item) => item.name).join(', ')}`
    )
  }
}

export const applyRecipeGuardrails = (
  recipes: readonly RecipeCandidateInput[],
  selectedProducts: readonly RecipeProductInput[]
): RecipeCandidateInput[] => {
  if (recipes.length < 1 || recipes.length > 5) {
    throw new ApplicationError('invalid_input', 'Chef must return 1-5 recipes')
  }
  recipes.forEach((recipe) =>
    assertRecipeUsesOnlySelectedProducts(recipe, selectedProducts)
  )
  return recipes.map((recipe, index) => ({
    ...recipe,
    id: recipe.id || `recipe-${index + 1}`,
    assumedBasics: [],
    selectedProducts: selectedProducts.map((product) => ({ ...product })),
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      pantryBasic: false,
      fromSelectedProducts:
        ingredient.fromSelectedProducts ||
        isSelectedProductIngredient(ingredient.name, productNameSet(selectedProducts))
    }))
  }))
}
