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
  it('allows selected products and pantry basics', () => {
    expect(applyRecipeGuardrails([recipe('eggs'), recipe('salt')], products)).toHaveLength(2)
  })

  it('allows Hebrew pantry basics', () => {
    expect(applyRecipeGuardrails([recipe('מלח'), recipe('פלפל שחור')], products)).toHaveLength(2)
  })

  it('rejects non-basic ingredients that were not selected', () => {
    expect(() => applyRecipeGuardrails([recipe('chicken')], products)).toThrow(ApplicationError)
  })
})
