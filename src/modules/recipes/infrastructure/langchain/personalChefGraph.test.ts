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

describe('personalChefGraph', () => {
  it('returns deterministic local recipes without network access', async () => {
    await expect(
      personalChefGraph(createDeterministicChefGenerator())(input)
    ).resolves.toMatchObject({
      runId: 'run-1',
      recipes: [
        {
          servings: 2,
          mealType: 'quick_dinner',
          selectedProducts: input.products,
          nutrition: {
            calories: expect.any(Number),
            proteinGrams: expect.any(Number),
            fatGrams: expect.any(Number)
          },
          image: {
            url: expect.stringContaining('https://source.unsplash.com/featured/900x600/?')
          }
        }
      ],
      warnings: []
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
                assumedBasics: ['salt', 'pepper', 'oil'],
                ingredients: [
                  { ingredient: 'eggs', amount: 6 },
                  { item: 'tomatoes', qty: 4 },
                  { product: 'salt', quantity: 'to taste' }
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
            url: expect.stringContaining('https://source.unsplash.com/featured/900x600/?')
          },
          selectedProducts: input.products,
          ingredients: [
            { name: 'eggs', quantity: '6', fromSelectedProducts: true },
            { name: 'tomatoes', quantity: '4', fromSelectedProducts: true },
            { name: 'salt', quantity: 'to taste', pantryBasic: true }
          ],
          nutrition: {
            calories: expect.any(Number),
            proteinGrams: expect.any(Number),
            fatGrams: expect.any(Number)
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
                assumedBasics: ['salt', 'pepper', 'oil'],
                ingredients: [
                  { ingredient: 'eggs', amount: 6 },
                  { item: 'tomatoes', qty: 4 },
                  { product: 'salt', quantity: 'to taste' }
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
      )(input)
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

  it('uses local nutrition estimates when the nutrition node fails', async () => {
    const nutritionEstimator: PersonalChefNutritionEstimator = {
      async invoke() {
        throw new PersonalChefModelError(new Error('nutrition unavailable'))
      }
    }

    await expect(
      personalChefGraph(
        createDeterministicChefGenerator(),
        nutritionEstimator
      )(input)
    ).resolves.toMatchObject({
      recipes: [
        {
          nutrition: {
            calories: expect.any(Number),
            proteinGrams: expect.any(Number),
            fatGrams: expect.any(Number)
          }
        }
      ],
      warnings: expect.arrayContaining([
        'Nutrition AI was unavailable, so local nutrition estimates were used.'
      ])
    })
  })
})
