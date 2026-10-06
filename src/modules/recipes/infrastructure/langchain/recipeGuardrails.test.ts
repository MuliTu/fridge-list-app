import { ApplicationError } from '../../../shared'
import type { RecipeCandidateInput } from '../../domain/recipeSchemas'
import { applyRecipeGuardrails } from './recipeGuardrails'

const products = [
  {
    groceryKey: '-eggs',
    name: 'eggs',
    category: 'Dairy',
    quantity: 6,
    unit: 'pcs'
  }
]

const recipe = (ingredientName: string): RecipeCandidateInput => ({
  id: 'candidate-1',
  title: 'Egg skillet',
  description: 'A quick egg skillet.',
  servings: 2,
  mealType: 'quick_dinner',
  estimatedTimeMinutes: 20,
  selectedProducts: products,
  assumedBasics: ['salt'],
  ingredients: [
    {
      name: ingredientName,
      quantity: null,
      fromSelectedProducts: ingredientName === 'eggs',
      pantryBasic: ingredientName === 'salt'
    }
  ],
  steps: ['Cook it.'],
  nutrition: {
    calories: null,
    proteinGrams: null,
    fatGrams: null
  },
  image: { url: null, alt: 'Egg skillet' },
  source: { kind: 'personal_chef', graphRunId: 'run-1' }
})

describe('recipe guardrails', () => {
  it('allows selected products and clears assumed basics', () => {
    expect(applyRecipeGuardrails([recipe('eggs')], products)).toMatchObject([
      {
        assumedBasics: [],
        ingredients: [{ name: 'eggs', pantryBasic: false, fromSelectedProducts: true }]
      }
    ])
  })

  it('rejects pantry basics that were not selected', () => {
    expect(() => applyRecipeGuardrails([recipe('salt')], products)).toThrow(ApplicationError)
    expect(() => applyRecipeGuardrails([recipe('מלח')], products)).toThrow(ApplicationError)
  })

  it('rejects compound ingredient names that smuggle in unselected products', () => {
    expect(() => applyRecipeGuardrails([recipe('eggs with butter')], products)).toThrow(ApplicationError)
  })

  it('rejects other ingredients that were not selected', () => {
    expect(() => applyRecipeGuardrails([recipe('chicken')], products)).toThrow(ApplicationError)
  })
})

it('binds an accepted ingredient to the authoritative grocery key', () => {
  expect(applyRecipeGuardrails([recipe('eggs')], products)[0].ingredients[0].groceryKey).toBe('-eggs')
})

it('rejects a forged key even when the ingredient name matches', () => {
  const candidate = recipe('eggs')
  candidate.ingredients[0].groceryKey = 'forged'
  expect(() => applyRecipeGuardrails([candidate], products)).toThrow(ApplicationError)
})

it('requires an explicit key to disambiguate equal product names', () => {
  const duplicated = [...products, { ...products[0], groceryKey: 'second' }]
  expect(() => applyRecipeGuardrails([recipe('eggs')], duplicated)).toThrow(ApplicationError)
  const candidate = recipe('eggs')
  candidate.ingredients[0].groceryKey = 'second'
  expect(applyRecipeGuardrails([candidate], duplicated)[0].ingredients[0].groceryKey).toBe('second')
})
