import { ChatPromptTemplate } from '@langchain/core/prompts'
import type { Runnable } from '@langchain/core/runnables'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'

import chefHumanPrompt from '../../../../prompts/agents/chefPrompts/human.md?raw'
import chefSystemPrompt from '../../../../prompts/agents/chefPrompts/system.md?raw'
import chefJsonHumanPrompt from '../../../../prompts/agents/chefJsonPrompts/human.md?raw'
import chefJsonSystemPrompt from '../../../../prompts/agents/chefJsonPrompts/system.md?raw'
import chefNutritionHumanPrompt from '../../../../prompts/agents/chefNutritionPrompts/human.md?raw'
import chefNutritionSystemPrompt from '../../../../prompts/agents/chefNutritionPrompts/system.md?raw'
import chefJsonNutritionHumanPrompt from '../../../../prompts/agents/chefJsonNutritionPrompts/human.md?raw'
import chefJsonNutritionSystemPrompt from '../../../../prompts/agents/chefJsonNutritionPrompts/system.md?raw'
import { ApplicationError } from '../../../shared'
import {
  emptyRecipeNutrition,
  recipeNutritionResponseSchema,
  recipeSuggestionResponseSchema,
  suggestRecipesInputSchema,
  type RecipeCandidateInput,
  type RecipeNutritionInput,
  type RecipeNutritionResponse,
  type RecipeSuggestionResponse,
  type SuggestRecipesInput
} from '../../domain/recipeSchemas'
import { applyRecipeGuardrails } from './recipeGuardrails'
import { defaultPantryBasics } from './pantryBasics'

export const DEFAULT_PERSONAL_CHEF_RECURSION_LIMIT = 8

export interface PersonalChefAgentInput extends SuggestRecipesInput {
  runId: string
}

export interface PersonalChefAgentResult {
  runId: string
  recipes: RecipeCandidateInput[]
  warnings: string[]
}

export interface PersonalChefGenerator {
  invoke(input: {
    request: SuggestRecipesInput
    pantryBasics: string[]
    runId: string
  }): Promise<RecipeSuggestionResponse>
}

export interface PersonalChefNutritionEstimator {
  invoke(input: {
    request: SuggestRecipesInput
    pantryBasics: string[]
    recipes: RecipeCandidateInput[]
    runId: string
  }): Promise<RecipeNutritionResponse>
}

export class PersonalChefModelError extends Error {
  readonly code = 'MODEL_ERROR'

  constructor(cause?: unknown) {
    super('Personal chef model invocation failed')
    this.name = 'PersonalChefModelError'
    this.cause = cause
  }
}

const PersonalChefState = Annotation.Root({
  runId: Annotation<string>(),
  request: Annotation<SuggestRecipesInput | undefined>(),
  message: Annotation<string | undefined>(),
  pantryBasics: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  candidateRecipes: Annotation<RecipeCandidateInput[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  finalRecipes: Annotation<RecipeCandidateInput[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  warnings: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => []
  })
})

export interface PersonalChefGraphOptions {
  recursionLimit?: number
}

const parseMessageRequest = (message: string | undefined): unknown => {
  if (!message?.trim()) return undefined
  try {
    const parsed = JSON.parse(message)
    if (parsed && typeof parsed === 'object' && 'request' in parsed) {
      return (parsed as { request?: unknown }).request
    }
    return parsed
  } catch {
    return undefined
  }
}

const requestFromState = (state: typeof PersonalChefState.State): SuggestRecipesInput => {
  const candidate = state.request ?? parseMessageRequest(state.message)
  if (!candidate) {
    throw new ApplicationError(
      'invalid_input',
      'personal_chef requires a request object with listId, servings, mealType, products, and optional preferences'
    )
  }
  return suggestRecipesInputSchema.parse(candidate)
}

const validatedRequestFromState = (
  state: typeof PersonalChefState.State
): SuggestRecipesInput => {
  if (!state.request) {
    throw new ApplicationError('invalid_input', 'personal_chef request was not validated')
  }
  return state.request
}

const fallbackImageTerms = (
  title: string,
  products: SuggestRecipesInput['products']
): string => {
  const productNames = products
    .slice(0, 3)
    .map((product) => product.name)
    .join(' ')
  return encodeURIComponent(`${title} ${productNames} meal`.trim())
}

const recipeFallbackImageUrl = (
  title: string,
  products: SuggestRecipesInput['products']
): string =>
  `https://source.unsplash.com/featured/900x600/?${fallbackImageTerms(title, products)}`

const normalizeNutrition = (
  nutrition: Partial<RecipeNutritionInput> | null | undefined
): RecipeNutritionInput => ({
  ...emptyRecipeNutrition,
  ...nutrition
})

const recipeWithNutrition = (
  recipe: RecipeCandidateInput,
  nutrition: Partial<RecipeNutritionInput> | null | undefined
): RecipeCandidateInput => ({
  ...recipe,
  nutrition: normalizeNutrition(nutrition)
})

const deterministicNutritionFor = (recipe: RecipeCandidateInput): RecipeNutritionInput => {
  const selectedCount = Math.max(1, recipe.selectedProducts.length)
  const ingredientCount = Math.max(selectedCount, recipe.ingredients.length)
  return {
    calories: 160 + selectedCount * 70 + ingredientCount * 20,
    proteinGrams: Math.round((selectedCount * 5 + ingredientCount * 1.5) * 10) / 10,
    fatGrams: Math.round((selectedCount * 3 + ingredientCount * 1.2) * 10) / 10,
    carbsGrams: Math.round((selectedCount * 9 + ingredientCount * 2) * 10) / 10,
    fiberGrams: Math.round(selectedCount * 1.5 * 10) / 10,
    sugarGrams: Math.round(selectedCount * 1.8 * 10) / 10,
    sodiumMg: 320 + ingredientCount * 35
  }
}

export const createDeterministicChefGenerator = (): PersonalChefGenerator => ({
  async invoke({ request, runId }) {
    const mainProducts = request.products.slice(0, 4)
    const titleProducts = mainProducts.map((product) => product.name).join(', ')
    const mealName = request.mealType === 'breakfast'
      ? 'Simple breakfast plate'
      : request.mealType === 'snack'
        ? 'Quick selected-products snack plate'
        : 'Simple skillet meal'

    return recipeSuggestionResponseSchema.parse({
      recipes: [
        {
          id: 'recipe-1',
          title: `${mealName} with ${titleProducts}`,
          description: `A practical ${request.mealType.replace('_', ' ')} using only the selected products.`,
          servings: request.servings,
          mealType: request.mealType,
          estimatedTimeMinutes: request.mealType === 'quick_dinner' ? 20 : 35,
          selectedProducts: request.products,
          assumedBasics: [],
          ingredients: mainProducts.map((product) => ({
            name: product.name,
            quantity: product.quantity && product.unit ? `${product.quantity} ${product.unit}` : null,
            fromSelectedProducts: true,
            pantryBasic: false
          })),
          steps: [
            'Wash, trim, and prepare the selected products.',
            'Prepare each selected product using the simplest suitable method.',
            'Combine the prepared products and portion them for the target servings.',
            'Serve warm or at room temperature, depending on the selected products.'
          ],
          nutrition: emptyRecipeNutrition,
          image: {
            url: recipeFallbackImageUrl(`${mealName} with ${titleProducts}`, request.products),
            alt: `${mealName} with ${titleProducts}`
          },
          chefNotes: request.preferences
            ? `Adapted for: ${request.preferences}.`
            : 'Uses only the selected products.',
          source: {
            kind: 'personal_chef',
            graphRunId: runId,
            model: 'deterministic-local'
          }
        }
      ],
      warnings: []
    })
  }
})

export const createDeterministicNutritionEstimator = (): PersonalChefNutritionEstimator => ({
  async invoke({ recipes }) {
    return recipeNutritionResponseSchema.parse({
      estimates: recipes.map((recipe) => ({
        recipeId: recipe.id,
        nutrition: deterministicNutritionFor(recipe)
      })),
      warnings: []
    })
  }
})

export const createStructuredModelChefGenerator = (
  model: Runnable<unknown, unknown>
): PersonalChefGenerator => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', chefSystemPrompt],
    ['human', chefHumanPrompt]
  ])

  return {
    async invoke({ request, pantryBasics, runId }) {
      try {
        const messages = await prompt.invoke({
          runId,
          servings: String(request.servings),
          mealType: request.mealType,
          language: request.language ?? 'en',
          preferences: request.preferences ?? '',
          chefMessage: request.chefMessage ?? '',
          products: JSON.stringify(request.products),
          pantryBasics: JSON.stringify(pantryBasics)
        })
        return recipeSuggestionResponseSchema.parse(
          await model.invoke(messages.toChatMessages())
        )
      } catch (error) {
        throw new PersonalChefModelError(error)
      }
    }
  }
}

const stringifyModelContent = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '')
        }
        return ''
      })
      .join('')
  }
  return ''
}

const parseJsonObject = (text: string): unknown => {
  const trimmed = text.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  return JSON.parse(withoutFence)
}

const normalizeIngredientName = (name: unknown): string =>
  typeof name === 'string' ? name.trim().toLocaleLowerCase() : ''

const firstStringField = (
  value: Record<string, unknown>,
  fields: string[]
): string | undefined => {
  for (const field of fields) {
    const candidate = value[field]
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate
    }
  }
  return undefined
}

const normalizeLooseRecipeResponse = (
  value: unknown,
  request: SuggestRecipesInput,
  pantryBasics: string[],
  runId: string
): unknown => {
  if (!value || typeof value !== 'object') return value

  const selectedProductNames = new Set(
    request.products.map((product) => normalizeIngredientName(product.name))
  )
  const selectedProductKeys = new Set(
    request.products.map((product) => normalizeIngredientName(product.groceryKey))
  )
  const pantryBasicNames = new Set(pantryBasics.map(normalizeIngredientName))
  const response = value as {
    recipes?: unknown
    warnings?: unknown
  }

  return {
    recipes: Array.isArray(response.recipes)
      ? response.recipes.map((candidate, index) => {
          const recipe = candidate && typeof candidate === 'object'
            ? candidate as Record<string, unknown>
            : {}
          const ingredients = Array.isArray(recipe.ingredients)
            ? recipe.ingredients.map((candidateIngredient) => {
                const ingredient = candidateIngredient && typeof candidateIngredient === 'object'
                  ? candidateIngredient as Record<string, unknown>
                  : {}
                const ingredientName = firstStringField(ingredient, [
                  'name',
                  'ingredient',
                  'item',
                  'product',
                  'title'
                ])
                const quantity =
                  ingredient.quantity ??
                  ingredient.amount ??
                  ingredient.qty ??
                  ingredient.measure
                const name = normalizeIngredientName(ingredientName)
                const fromSelectedProducts =
                  typeof ingredient.fromSelectedProducts === 'boolean'
                    ? ingredient.fromSelectedProducts
                    : selectedProductNames.has(name) || selectedProductKeys.has(name)
                const pantryBasic =
                  typeof ingredient.pantryBasic === 'boolean'
                    ? ingredient.pantryBasic
                    : !fromSelectedProducts && pantryBasicNames.has(name)

                return {
                  ...ingredient,
                  name: ingredientName,
                  quantity:
                    quantity === undefined || quantity === null
                      ? null
                      : String(quantity),
                  fromSelectedProducts,
                  pantryBasic
                }
              })
              .filter((ingredient) => typeof ingredient.name === 'string' && ingredient.name.trim())
            : []
          const safeIngredients = ingredients.length > 0
            ? ingredients
            : request.products.slice(0, 3).map((product) => ({
                name: product.name,
                quantity: product.quantity && product.unit ? `${product.quantity} ${product.unit}` : null,
                fromSelectedProducts: true,
                pantryBasic: false
              }))

          const image = recipe.image && typeof recipe.image === 'object'
            ? recipe.image as Record<string, unknown>
            : {}
          const source = recipe.source && typeof recipe.source === 'object'
            ? recipe.source as Record<string, unknown>
            : {}
          const title = typeof recipe.title === 'string' && recipe.title.trim()
            ? recipe.title
            : `Recipe ${index + 1}`

          return {
            ...recipe,
            id: typeof recipe.id === 'string' && recipe.id.trim()
              ? recipe.id
              : `recipe-${index + 1}`,
            servings: request.servings,
            mealType: request.mealType,
            selectedProducts: request.products,
            assumedBasics: Array.isArray(recipe.assumedBasics)
              ? recipe.assumedBasics.map(String)
              : [],
            ingredients: safeIngredients,
            image: {
              url: typeof image.url === 'string' && image.url.trim()
                ? image.url
                : recipeFallbackImageUrl(title, request.products),
              sourceUrl: typeof image.sourceUrl === 'string' ? image.sourceUrl : undefined,
              sourceName: typeof image.sourceName === 'string' ? image.sourceName : undefined,
              alt: typeof image.alt === 'string' && image.alt.trim()
                ? image.alt
                : typeof recipe.title === 'string' && recipe.title.trim()
                  ? recipe.title
                  : 'Suggested recipe'
            },
            source: {
              ...source,
              kind: 'personal_chef',
              graphRunId: runId,
              model: typeof source.model === 'string' && source.model.trim()
                ? source.model
                : 'groq'
            },
            nutrition: normalizeNutrition(
              recipe.nutrition && typeof recipe.nutrition === 'object'
                ? recipe.nutrition as Partial<RecipeNutritionInput>
                : null
            )
          }
        })
      : [],
    warnings: Array.isArray(response.warnings)
      ? response.warnings.map(String).filter(Boolean)
      : []
  }
}

export const createJsonTextChefGenerator = (
  model: Runnable<unknown, unknown>
): PersonalChefGenerator => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', chefJsonSystemPrompt],
    ['human', chefJsonHumanPrompt]
  ])

  return {
    async invoke({ request, pantryBasics, runId }) {
      try {
        const messages = await prompt.invoke({
          runId,
          servings: String(request.servings),
          mealType: request.mealType,
          language: request.language ?? 'en',
          preferences: request.preferences ?? '',
          chefMessage: request.chefMessage ?? '',
          products: JSON.stringify(request.products),
          pantryBasics: JSON.stringify(pantryBasics)
        })
        const response = await model.invoke(messages.toChatMessages())
        const content = stringifyModelContent((response as { content?: unknown })?.content)
        return recipeSuggestionResponseSchema.parse(
          normalizeLooseRecipeResponse(
            parseJsonObject(content),
            request,
            pantryBasics,
            runId
          )
        )
      } catch (error) {
        throw new PersonalChefModelError(error)
      }
    }
  }
}

const nutritionPromptRecipes = (recipes: RecipeCandidateInput[]) =>
  recipes.map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    selectedProducts: recipe.selectedProducts,
    assumedBasics: recipe.assumedBasics,
    ingredients: recipe.ingredients,
    steps: recipe.steps
  }))

export const createStructuredModelNutritionEstimator = (
  model: Runnable<unknown, unknown>
): PersonalChefNutritionEstimator => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', chefNutritionSystemPrompt],
    ['human', chefNutritionHumanPrompt]
  ])

  return {
    async invoke({ request, pantryBasics, recipes, runId }) {
      try {
        const messages = await prompt.invoke({
          runId,
          servings: String(request.servings),
          mealType: request.mealType,
          language: request.language ?? 'en',
          products: JSON.stringify(request.products),
          pantryBasics: JSON.stringify(pantryBasics),
          recipes: JSON.stringify(nutritionPromptRecipes(recipes))
        })
        return recipeNutritionResponseSchema.parse(
          await model.invoke(messages.toChatMessages())
        )
      } catch (error) {
        throw new PersonalChefModelError(error)
      }
    }
  }
}

export const createJsonTextNutritionEstimator = (
  model: Runnable<unknown, unknown>
): PersonalChefNutritionEstimator => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', chefJsonNutritionSystemPrompt],
    ['human', chefJsonNutritionHumanPrompt]
  ])

  return {
    async invoke({ request, pantryBasics, recipes, runId }) {
      try {
        const messages = await prompt.invoke({
          runId,
          servings: String(request.servings),
          mealType: request.mealType,
          language: request.language ?? 'en',
          products: JSON.stringify(request.products),
          pantryBasics: JSON.stringify(pantryBasics),
          recipes: JSON.stringify(nutritionPromptRecipes(recipes))
        })
        const response = await model.invoke(messages.toChatMessages())
        const content = stringifyModelContent((response as { content?: unknown })?.content)
        return recipeNutritionResponseSchema.parse(parseJsonObject(content))
      } catch (error) {
        throw new PersonalChefModelError(error)
      }
    }
  }
}

export const createCompiledPersonalChefGraph = (
  generator: PersonalChefGenerator,
  nutritionEstimator: PersonalChefNutritionEstimator = createDeterministicNutritionEstimator(),
  options: PersonalChefGraphOptions = {}
) => {
  const recursionLimit =
    options.recursionLimit ?? DEFAULT_PERSONAL_CHEF_RECURSION_LIMIT
  if (!Number.isInteger(recursionLimit) || recursionLimit <= 0) {
    throw new TypeError('recursionLimit must be a positive integer')
  }

  const validateRequest = (state: typeof PersonalChefState.State) => ({
    request: requestFromState(state),
    pantryBasics: defaultPantryBasics()
  })

  const generateCandidates = async (state: typeof PersonalChefState.State) => {
    const request = validatedRequestFromState(state)
    const result = await generator.invoke({
      request,
      pantryBasics: state.pantryBasics,
      runId: state.runId
    })
    return {
      candidateRecipes: result.recipes,
      warnings: result.warnings
    }
  }

  const normalizeAndGuardrailRecipes = (state: typeof PersonalChefState.State) => {
    const request = validatedRequestFromState(state)
    try {
      return {
        finalRecipes: applyRecipeGuardrails(
          state.candidateRecipes,
          request.products
        )
      }
    } catch (error) {
      if (error instanceof ApplicationError) throw error
      throw new ApplicationError('invalid_input', 'Chef returned invalid recipes', error)
    }
  }

  const estimateNutrition = async (state: typeof PersonalChefState.State) => {
    const request = validatedRequestFromState(state)
    try {
      const result = await nutritionEstimator.invoke({
        request,
        pantryBasics: state.pantryBasics,
        recipes: state.finalRecipes,
        runId: state.runId
      })
      const byRecipeId = new Map(
        result.estimates.map((estimate) => [estimate.recipeId, estimate.nutrition])
      )
      return {
        finalRecipes: state.finalRecipes.map((recipe) =>
          recipeWithNutrition(
            recipe,
            byRecipeId.get(recipe.id) ?? deterministicNutritionFor(recipe)
          )
        ),
        warnings: [...state.warnings, ...result.warnings]
      }
    } catch (error) {
      if (error instanceof ApplicationError) throw error
      return {
        finalRecipes: state.finalRecipes.map((recipe) =>
          recipeWithNutrition(recipe, deterministicNutritionFor(recipe))
        ),
        warnings: [
          ...state.warnings,
          'Nutrition AI was unavailable, so local nutrition estimates were used.'
        ]
      }
    }
  }

  const finalize = (state: typeof PersonalChefState.State) => ({
    runId: state.runId,
    recipes: state.finalRecipes,
    warnings: state.warnings
  })

  return new StateGraph(PersonalChefState)
    .addNode('validate_cooking_request', validateRequest)
    .addNode('generate_recipe_candidates', generateCandidates)
    .addNode('normalize_and_guardrail_recipes', normalizeAndGuardrailRecipes)
    .addNode('estimate_recipe_nutrition', estimateNutrition)
    .addNode('finalize_response', finalize)
    .addEdge(START, 'validate_cooking_request')
    .addEdge('validate_cooking_request', 'generate_recipe_candidates')
    .addEdge('generate_recipe_candidates', 'normalize_and_guardrail_recipes')
    .addEdge('normalize_and_guardrail_recipes', 'estimate_recipe_nutrition')
    .addEdge('estimate_recipe_nutrition', 'finalize_response')
    .addEdge('finalize_response', END)
    .compile()
}

export const personalChefGraph = (
  generator: PersonalChefGenerator,
  nutritionEstimator: PersonalChefNutritionEstimator = createDeterministicNutritionEstimator(),
  options: PersonalChefGraphOptions = {}
) => {
  const graph = createCompiledPersonalChefGraph(generator, nutritionEstimator, options)
  return async (input: PersonalChefAgentInput): Promise<PersonalChefAgentResult> => {
    try {
      const initialState = {
        runId: input.runId,
        request: suggestRecipesInputSchema.parse(input),
        message: undefined,
        pantryBasics: [],
        candidateRecipes: [],
        finalRecipes: [],
        warnings: []
      }
      const result = await graph.invoke(initialState, {
        recursionLimit: options.recursionLimit ?? DEFAULT_PERSONAL_CHEF_RECURSION_LIMIT
      })
      return {
        runId: result.runId,
        recipes: result.finalRecipes,
        warnings: result.warnings
      }
    } catch (error) {
      if (
        error instanceof Error &&
        /Recursion limit/i.test(error.message)
      ) {
        throw new ApplicationError('unavailable', 'Personal chef graph reached its step limit', error)
      }
      throw error
    }
  }
}
