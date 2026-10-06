import cases from './ingredient-grounding.json'
import { applyRecipeGuardrails } from '../infrastructure/langchain/recipeGuardrails'
import { emptyRecipeNutrition, type RecipeCandidateInput } from '../domain/recipeSchemas'

// Offline adversarial ingredient admission, not a real-model quality score.
describe('synthetic bilingual ingredient grounding evaluation', () => {
  it.each(cases)('$id', ({ selected, ingredient, allowed }) => {
    const products = [{ groceryKey: 'authoritative-key', name: selected, category: 'synthetic' }]
    const recipe: RecipeCandidateInput = {
      id: 'candidate', title: 'Synthetic case', description: 'Evaluation only',
      servings: 1, mealType: 'other', estimatedTimeMinutes: null,
      selectedProducts: [{ groceryKey: 'forged-key', name: 'forged product', category: 'synthetic' }],
      assumedBasics: ['salt'],
      ingredients: [{ name: ingredient, quantity: null, fromSelectedProducts: true, pantryBasic: true }],
      steps: ['Evaluation only'], nutrition: emptyRecipeNutrition,
      image: { url: null, alt: 'No image' }, source: { kind: 'personal_chef', graphRunId: 'synthetic-run' }
    }
    if (!allowed) {
      expect(() => applyRecipeGuardrails([recipe], products)).toThrow()
      return
    }
    expect(applyRecipeGuardrails([recipe], products)[0]).toMatchObject({
      selectedProducts: products, assumedBasics: [],
      ingredients: [{ name: ingredient, pantryBasic: false, fromSelectedProducts: true }]
    })
  })
})
