import { ChatPromptTemplate } from '@langchain/core/prompts'
import type { Runnable } from '@langchain/core/runnables'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'

import { ApplicationError } from '../../../shared'
import {
  recipeSuggestionResponseSchema,
  suggestRecipesInputSchema,
  type RecipeCandidateInput,
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

export const createDeterministicChefGenerator = (): PersonalChefGenerator => ({
  async invoke({ request, pantryBasics, runId }) {
    const mainProducts = request.products.slice(0, 4)
    const titleProducts = mainProducts.map((product) => product.name).join(', ')
    const mealName = request.mealType === 'breakfast'
      ? 'Simple breakfast plate'
      : request.mealType === 'snack'
        ? 'Quick pantry snack plate'
        : 'Simple skillet meal'

    return recipeSuggestionResponseSchema.parse({
      recipes: [
        {
          id: 'recipe-1',
          title: `${mealName} with ${titleProducts}`,
          description: `A practical ${request.mealType.replace('_', ' ')} using the selected products and basic pantry seasoning.`,
          servings: request.servings,
          mealType: request.mealType,
          estimatedTimeMinutes: request.mealType === 'quick_dinner' ? 20 : 35,
          selectedProducts: request.products,
          assumedBasics: pantryBasics.slice(0, 4),
          ingredients: [
            ...mainProducts.map((product) => ({
              name: product.name,
              quantity: product.quantity && product.unit ? `${product.quantity} ${product.unit}` : null,
              fromSelectedProducts: true,
              pantryBasic: false
            })),
            { name: 'salt', quantity: 'to taste', fromSelectedProducts: false, pantryBasic: true },
            { name: 'pepper', quantity: 'to taste', fromSelectedProducts: false, pantryBasic: true },
            { name: 'oil', quantity: '1 tbsp', fromSelectedProducts: false, pantryBasic: true }
          ],
          steps: [
            'Wash, trim, and prepare the selected products.',
            'Warm a pan with a little oil over medium heat.',
            'Cook the selected products until tender and season with salt and pepper.',
            'Taste, adjust seasoning, and serve warm.'
          ],
          image: {
            url: recipeFallbackImageUrl(`${mealName} with ${titleProducts}`, request.products),
            alt: `${mealName} with ${titleProducts}`
          },
          chefNotes: request.preferences
            ? `Adapted for: ${request.preferences}.`
            : 'Use the selected products first and keep pantry basics minimal.',
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

export const createStructuredModelChefGenerator = (
  model: Runnable<unknown, unknown>
): PersonalChefGenerator => {
  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      [
        'You are a practical household chef.',
        'Create 1-5 recipes using only selected products plus pantry basics.',
        'Do not require unselected non-basic products.',
        'Return structured data in the requested language.',
        'Mention pantry basics only when used.'
      ].join('\n')
    ],
    [
      'human',
      [
        'Run id: {runId}',
        'Servings: {servings}',
        'Meal type: {mealType}',
        'Language: {language}',
        'Preferences: {preferences}',
        'Selected products JSON: {products}',
        'Allowed pantry basics JSON: {pantryBasics}'
      ].join('\n')
    ]
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
            }
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
    [
      'system',
      [
        'You are a practical household chef.',
        'Return only valid JSON. Do not wrap it in markdown.',
        'The JSON must have this shape: {{"recipes":[...],"warnings":[]}}.',
        'Create 1-5 recipes using only selected products plus pantry basics.',
        'Do not require unselected non-basic products.',
        'Each recipe must include id, title, description, servings, mealType, estimatedTimeMinutes, selectedProducts, assumedBasics, ingredients, steps, image, chefNotes, and source.',
        'For image use {{"url":null,"alt":"descriptive alt text"}} unless you know a safe URL.',
        'For source use {{"kind":"personal_chef","graphRunId":"the provided run id","model":"groq"}}.'
      ].join('\n')
    ],
    [
      'human',
      [
        'Run id: {runId}',
        'Servings: {servings}',
        'Meal type: {mealType}',
        'Language: {language}',
        'Preferences: {preferences}',
        'Selected products JSON: {products}',
        'Allowed pantry basics JSON: {pantryBasics}'
      ].join('\n')
    ]
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

export const createCompiledPersonalChefGraph = (
  generator: PersonalChefGenerator,
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

  const finalize = (state: typeof PersonalChefState.State) => ({
    runId: state.runId,
    recipes: state.finalRecipes,
    warnings: state.warnings
  })

  return new StateGraph(PersonalChefState)
    .addNode('validate_cooking_request', validateRequest)
    .addNode('generate_recipe_candidates', generateCandidates)
    .addNode('normalize_and_guardrail_recipes', normalizeAndGuardrailRecipes)
    .addNode('finalize_response', finalize)
    .addEdge(START, 'validate_cooking_request')
    .addEdge('validate_cooking_request', 'generate_recipe_candidates')
    .addEdge('generate_recipe_candidates', 'normalize_and_guardrail_recipes')
    .addEdge('normalize_and_guardrail_recipes', 'finalize_response')
    .addEdge('finalize_response', END)
    .compile()
}

export const personalChefGraph = (
  generator: PersonalChefGenerator,
  options: PersonalChefGraphOptions = {}
) => {
  const graph = createCompiledPersonalChefGraph(generator, options)
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
