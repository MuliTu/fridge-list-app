import {
  PersonalChefModelError,
  createDeterministicChefGenerator,
  createJsonTextChefGenerator,
  createJsonTextNutritionEstimator,
  personalChefGraph,
  type PersonalChefGenerator,
  type PersonalChefNutritionEstimator
} from './personalChefGraph'
import { AIMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'

const input = {
  runId: 'run-1',
  listId: 'owner_email_com',
  servings: 2,
  mealType: 'quick_dinner' as const,
  preferences: 'no oven',
  language: 'en' as const,
  products: [
    {
      groceryKey: '-eggs',
      name: 'eggs',
      category: 'Dairy',
      quantity: 6,
      unit: 'pcs'
    },
    {
      groceryKey: '-tomato',
      name: 'tomatoes',
      category: 'Vegetables',
      quantity: 4,
      unit: 'pcs'
    }
  ]
}

const demoInput = { ...input, products: [input.products[1]] }
const weightedInput = { ...input, products: input.products.map((product) => ({ ...product, quantity: 200, unit: 'g' })) }
const weightedDemoInput = { ...demoInput, products: demoInput.products.map((product) => ({ ...product, quantity: 200, unit: 'g' })) }

describe('personalChefGraph', () => {
  it('returns deterministic local recipes without network access', async () => {
    await expect(
      personalChefGraph(createDeterministicChefGenerator())(demoInput)
    ).resolves.toMatchObject({
      runId: 'run-1',
      recipes: [
        {
          servings: 2,
          mealType: 'quick_dinner',
          selectedProducts: demoInput.products,
          nutrition: {
            calories: null,
            proteinGrams: null,
            fatGrams: null
          },
          image: {
            url: null
          }
        }
      ],
      warnings: expect.arrayContaining(['Nutrition is unavailable without explicit ingredient weights.'])
    })
  })

  it('rejects generated recipes that require unselected ingredients', async () => {
    const generator: PersonalChefGenerator = {
      async invoke({ request, runId }) {
        return {
          recipes: [
            {
              id: 'bad-recipe',
              title: 'Chicken skillet',
              description: 'Not allowed.',
              servings: request.servings,
              mealType: request.mealType,
              estimatedTimeMinutes: 20,
              selectedProducts: request.products,
              assumedBasics: [],
              ingredients: [
                {
                  name: 'chicken',
                  quantity: null,
                  fromSelectedProducts: false,
                  pantryBasic: false
                }
              ],
              steps: ['Cook chicken.'],
              nutrition: {
                calories: null,
                proteinGrams: null,
                fatGrams: null
              },
              image: { url: null, alt: 'Chicken skillet' },
              source: { kind: 'personal_chef', graphRunId: runId }
            }
          ],
          warnings: []
        }
      }
    }

    await expect(personalChefGraph(generator)(input)).rejects.toMatchObject({
      code: 'invalid_input'
    })
  })

  it('maps generator failures to the safe model error when provided by the generator', async () => {
    const generator: PersonalChefGenerator = {
      async invoke() {
        throw new PersonalChefModelError()
      }
    }

    await expect(personalChefGraph(generator)(input)).rejects.toEqual(
      new PersonalChefModelError()
    )
  })

  it('parses a Groq-style JSON text response', async () => {
    const model = new RunnableLambda({
      func: async () =>
        new AIMessage({
          content: JSON.stringify({
            recipes: [
              {
                id: 'recipe-1',
                title: 'Egg and tomato skillet',
                description: 'Fast skillet dinner.',
                servings: 2,
                mealType: 'quick_dinner',
                estimatedTimeMinutes: 18,
                selectedProducts: [
                  { groceryKey: '-eggs', name: 'eggs', quantity: 6, unit: 'pcs' },
                  { groceryKey: '-tomato', name: 'tomatoes', quantity: 4, unit: 'pcs' }
                ],
                assumedBasics: [],
                ingredients: [
                  { ingredient: 'eggs', amount: 6 },
                  { item: 'tomatoes', qty: 4 }
                ],
                steps: ['Cook tomatoes.', 'Add eggs.', 'Serve warm.'],
                image: { url: null, alt: 'Egg and tomato skillet' },
                chefNotes: null,
                source: { kind: 'personal_chef', graphRunId: 'run-1', model: 'groq' }
              }
            ],
            warnings: []
          })
        })
    })

    await expect(
      personalChefGraph(createJsonTextChefGenerator(model))(input)
    ).resolves.toMatchObject({
      recipes: [
        {
          title: 'Egg and tomato skillet',
          image: {
            url: null
          },
          selectedProducts: input.products,
          ingredients: [
            { name: 'eggs', quantity: '6', fromSelectedProducts: true },
            { name: 'tomatoes', quantity: '4', fromSelectedProducts: true }
          ],
          nutrition: {
            calories: null,
            proteinGrams: null,
            fatGrams: null
          }
        }
      ]
    })
  })

  it('uses a separate JSON text nutrition node to enrich generated recipes', async () => {
    const recipeModel = new RunnableLambda({
      func: async () =>
        new AIMessage({
          content: JSON.stringify({
            recipes: [
              {
                id: 'recipe-1',
                title: 'Egg and tomato skillet',
                description: 'Fast skillet dinner.',
                servings: 2,
                mealType: 'quick_dinner',
                estimatedTimeMinutes: 18,
                selectedProducts: input.products,
                assumedBasics: [],
                ingredients: [
                  { ingredient: 'eggs', amount: 6 },
                  { item: 'tomatoes', qty: 4 }
                ],
                steps: ['Cook tomatoes.', 'Add eggs.', 'Serve warm.'],
                image: { url: null, alt: 'Egg and tomato skillet' },
                chefNotes: null,
                source: { kind: 'personal_chef', graphRunId: 'run-1', model: 'groq' }
              }
            ],
            warnings: []
          })
        })
    })
    const nutritionModel = new RunnableLambda({
      func: async () =>
        new AIMessage({
          content: JSON.stringify({
            estimates: [
              {
                recipeId: 'recipe-1',
                nutrition: {
                  calories: 310,
                  proteinGrams: 18,
                  fatGrams: 14,
                  carbsGrams: 22,
                  fiberGrams: 4,
                  sugarGrams: 8,
                  sodiumMg: 540
                }
              }
            ],
            warnings: []
          })
        })
    })

    await expect(
      personalChefGraph(
        createJsonTextChefGenerator(recipeModel),
        createJsonTextNutritionEstimator(nutritionModel)
      )(weightedInput)
    ).resolves.toMatchObject({
      recipes: [
        {
          id: 'recipe-1',
          nutrition: {
            calories: 310,
            proteinGrams: 18,
            fatGrams: 14,
            carbsGrams: 22
          }
        }
      ]
    })
  })

  it('keeps nutrition unknown when enrichment fails', async () => {
    const nutritionEstimator: PersonalChefNutritionEstimator = {
      async invoke() {
        throw new PersonalChefModelError(new Error('nutrition unavailable'))
      }
    }

    await expect(
      personalChefGraph(
        createDeterministicChefGenerator(),
        nutritionEstimator
      )(weightedDemoInput)
    ).resolves.toMatchObject({
      recipes: [
        {
          nutrition: {
            calories: null,
            proteinGrams: null,
            fatGrams: null
          }
        }
      ],
      warnings: expect.arrayContaining([
        'Nutrition estimates are unavailable; no values were invented.'
      ])
    })
  })
})


describe('chef execution budget', () => {
  it('aborts a hanging provider and returns a bounded unavailable error', async () => {
    let signal: AbortSignal | undefined
    const invoke = jest.fn((request) => {
      signal = request.signal
      return new Promise<never>(() => {})
    })
    await expect(personalChefGraph({ invoke }, undefined, { timeoutMs: 25 })(input))
      .rejects.toMatchObject({ code: 'unavailable' })
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(signal?.aborted).toBe(true)
  })

  it('does not call a provider for an already cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    const invoke = jest.fn()
    await expect(personalChefGraph({ invoke }, undefined, { signal: controller.signal })(input))
      .rejects.toMatchObject({ code: 'unavailable' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('passes no implicit pantry items and calls each provider at most once', async () => {
    const local = createDeterministicChefGenerator()
    const invoke = jest.fn(local.invoke)
    const nutrition = jest.fn(async () => ({ estimates: [{ recipeId: 'recipe-1', nutrition: { calories: null, proteinGrams: null, fatGrams: null } }], warnings: [] }))
    await personalChefGraph({ invoke }, { invoke: nutrition })(weightedDemoInput)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls[0][0].pantryBasics).toEqual([])
    expect(nutrition).toHaveBeenCalledTimes(1)
  })
})

it.each(['bleach', 'raw chicken', 'eggs', 'unknown ingredient', 'אקונומיקה', 'בשר נא'])(
  'does not turn unsupported demo product %s into cooking instructions', async (name) => {
    await expect(personalChefGraph(createDeterministicChefGenerator())({
      ...demoInput, products: [{ groceryKey: 'unsafe', name, category: 'Vegetables' }]
    })).rejects.toMatchObject({ code: 'invalid_input' })
  }
)

it('does not call nutrition enrichment for ambiguous piece units', async () => {
  const invoke = jest.fn()
  const result = await personalChefGraph(createDeterministicChefGenerator(), { invoke })(demoInput)
  expect(invoke).not.toHaveBeenCalled()
  expect(result.recipes[0].nutrition).toMatchObject({ calories: null, estimateSource: 'unavailable' })
})

it('discards nutrition estimates with unknown recipe IDs', async () => {
  const invoke = jest.fn(async () => ({
    estimates: [{ recipeId: 'wrong-id', nutrition: { calories: 500, proteinGrams: 10, fatGrams: 10 } }], warnings: []
  }))
  const result = await personalChefGraph(createDeterministicChefGenerator(), { invoke })(weightedDemoInput)
  expect(result.recipes[0].nutrition).toMatchObject({ calories: null, estimateSource: 'unavailable' })
  expect(result.warnings).toContain('Nutrition estimates are unavailable; no values were invented.')
})
