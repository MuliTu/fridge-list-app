import { SuggestRecipesService } from './suggestRecipes.service'
import {
  PersonalChefModelError,
  type PersonalChefGenerator
} from '../infrastructure/langchain/personalChefGraph'
import type { GroceryItem } from '../../../types'

const context = {
  principal: {
    kind: 'user' as const,
    uid: 'user-1',
    email: 'owner@example.com',
    emailVerified: true
  },
  requestId: 'request-1',
  now: new Date('2026-09-24T10:00:00.000Z')
}

const grocery = (index: number): GroceryItem => ({
  key: `-product-${index}`,
  item: `product ${index}`,
  category: 'Pantry',
  bought: true,
  added_at: '2026-09-24T10:00:00.000Z'
})

describe('SuggestRecipesService', () => {
  it('caps large select-all requests before invoking the model', async () => {
    const groceries = Array.from({ length: 203 }, (_, index) => grocery(index))
    const generator: PersonalChefGenerator = {
      invoke: jest.fn(async ({ request, runId }) => ({
        recipes: [
          {
            id: 'recipe-1',
            title: 'Pantry dinner',
            description: 'A bounded model request.',
            servings: request.servings,
            mealType: request.mealType,
            estimatedTimeMinutes: 20,
            selectedProducts: request.products,
            assumedBasics: ['salt'],
            ingredients: [
              {
                name: request.products[0].name,
                quantity: null,
                fromSelectedProducts: true,
                pantryBasic: false
              }
            ],
            steps: ['Cook.'],
            nutrition: {
              calories: null,
              proteinGrams: null,
              fatGrams: null
            },
            image: { url: null, alt: 'Pantry dinner' },
            source: { kind: 'personal_chef' as const, graphRunId: runId }
          }
        ],
        warnings: [] as string[]
      }))
    }
    const service = new SuggestRecipesService(
      {
        getGroceriesByKeys: jest.fn(async () => groceries)
      },
      {
        assertAccessible: jest.fn(async () => undefined)
      },
      generator,
      () => 'run-1'
    )

    const result = await service.execute(context, {
      listId: 'owner@example_com',
      servings: 2,
      mealType: 'quick_dinner',
      products: groceries.map((entry) => ({
        groceryKey: entry.key,
        name: entry.item,
        category: entry.category
      }))
    })

    expect(generator.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          products: expect.arrayContaining([
            expect.objectContaining({ groceryKey: '-product-0' })
          ])
        })
      })
    )
    expect((generator.invoke as jest.Mock).mock.calls[0][0].request.products).toHaveLength(20)
    expect(result.warnings[0]).toContain('Using 20 of 203 selected products')
  })

  it('returns a deterministic fallback recipe when the model is unavailable', async () => {
    const groceries = [grocery(1), grocery(2)]
    const generator: PersonalChefGenerator = {
      invoke: jest.fn(async () => {
        throw new PersonalChefModelError(new Error('Groq temporarily unavailable'))
      })
    }
    const service = new SuggestRecipesService(
      {
        getGroceriesByKeys: jest.fn(async () => groceries)
      },
      {
        assertAccessible: jest.fn(async () => undefined)
      },
      generator,
      () => 'run-fallback'
    )

    const result = await service.execute(context, {
      listId: 'owner@example_com',
      servings: 2,
      mealType: 'quick_dinner',
      products: groceries.map((entry) => ({
        groceryKey: entry.key,
        name: entry.item,
        category: entry.category
      }))
    })

    expect(result.runId).toBe('run-fallback')
    expect(result.recipes).toHaveLength(1)
    expect(result.recipes[0].source.model).toBe('deterministic-local')
    expect(result.warnings).toContain(
      'Chef AI was unavailable, so a local fallback suggestion was used.'
    )
  })
})
