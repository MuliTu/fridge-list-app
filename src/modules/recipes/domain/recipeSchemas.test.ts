import {
  recipeCandidateSchema,
  saveRecipeInputSchema,
  suggestRecipesInputSchema
} from './recipeSchemas'

const product = {
  groceryKey: '-eggs',
  name: 'eggs',
  category: 'Dairy',
  quantity: 6,
  unit: 'pcs'
}

const recipe = {
  id: 'candidate-1',
  title: 'Egg skillet',
  description: 'A quick egg skillet.',
  servings: 2,
  mealType: 'quick_dinner',
  estimatedTimeMinutes: 20,
  selectedProducts: [product],
  assumedBasics: ['salt', 'pepper'],
  ingredients: [
    {
      name: 'eggs',
      quantity: '6 pcs',
      fromSelectedProducts: true,
      pantryBasic: false
    },
    {
      name: 'salt',
      quantity: 'to taste',
      fromSelectedProducts: false,
      pantryBasic: true
    }
  ],
  steps: ['Cook the eggs.'],
  image: {
    url: null,
    alt: 'Egg skillet'
  },
  source: {
    kind: 'personal_chef',
    graphRunId: 'run-1'
  }
}

describe('recipe schemas', () => {
  it('accepts an image-less chef recipe candidate', () => {
    expect(recipeCandidateSchema.parse(recipe)).toMatchObject({
      title: 'Egg skillet',
      image: { url: null },
      nutrition: {
        calories: null,
        proteinGrams: null,
        fatGrams: null
      }
    })
  })

  it('validates save recipe input with list scope', () => {
    expect(
      saveRecipeInputSchema.parse({
        operationId: '00000000-0000-4000-8000-000000000001',
        listId: 'owner_email_com',
        recipe
      })
    ).toMatchObject({ listId: 'owner_email_com' })
  })

  it('rejects missing selected products for suggestions', () => {
    expect(() =>
      suggestRecipesInputSchema.parse({
        listId: 'owner_email_com',
        servings: 2,
        mealType: 'quick_dinner',
        products: []
      })
    ).toThrow()
  })

  it('accepts a large checked-products list from select all', () => {
    const products = Array.from({ length: 203 }, (_, index) => ({
      groceryKey: `-product-${index}`,
      name: `product ${index}`,
      category: 'Pantry'
    }))

    expect(
      suggestRecipesInputSchema.parse({
        listId: 'owner_email_com',
        servings: 2,
        mealType: 'quick_dinner',
        products
      }).products
    ).toHaveLength(203)
  })

  it('accepts an optional free chef message for suggestions', () => {
    expect(
      suggestRecipesInputSchema.parse({
        listId: 'owner_email_com',
        servings: 2,
        mealType: 'quick_dinner',
        preferences: 'vegetarian',
        chefMessage: 'Make it feel like a quick cafe lunch.',
        products: [product]
      })
    ).toMatchObject({
      chefMessage: 'Make it feel like a quick cafe lunch.'
    })
  })
})
