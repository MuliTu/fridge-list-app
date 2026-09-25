import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'

import { ApplicationError, type RequestContext } from '../../shared'
import type { ListAuthorizationRepository } from '../../groceries'
import {
  suggestRecipesInputSchema,
  type RecipeProductInput,
  type SuggestRecipesInput
} from '../domain/recipeSchemas'
import type { ChefGroceryRepository } from './recipeRepository'
import type {
  PersonalChefAgentResult,
  PersonalChefGenerator
} from '../infrastructure/langchain/personalChefGraph'
import {
  createDeterministicChefGenerator,
  PersonalChefModelError,
  personalChefGraph
} from '../infrastructure/langchain/personalChefGraph'

const normalizeProduct = (product: RecipeProductInput): RecipeProductInput => ({
  groceryKey: product.groceryKey,
  name: product.name,
  category: product.category,
  quantity: product.quantity ?? null,
  unit: product.unit ?? null
})

const MAX_MODEL_PRODUCTS = 20
const MODEL_FALLBACK_WARNING =
  'Chef AI was unavailable, so a local fallback suggestion was used.'

export class SuggestRecipesService {
  constructor(
    private readonly groceries: ChefGroceryRepository,
    private readonly authorization: ListAuthorizationRepository,
    private readonly generator: PersonalChefGenerator,
    private readonly createRunId: () => string = randomUUID
  ) {}

  async execute(
    context: RequestContext,
    input: unknown
  ): Promise<PersonalChefAgentResult> {
    let parsed: SuggestRecipesInput
    try {
      parsed = suggestRecipesInputSchema.parse(input)
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ApplicationError('invalid_input', 'Personal chef request is invalid', error)
      }
      throw error
    }
    await this.authorization.assertAccessible(context.principal, parsed.listId)

    const requestedKeys = parsed.products.map((product) => product.groceryKey)
    const liveProducts = await this.groceries.getGroceriesByKeys(
      parsed.listId,
      requestedKeys
    )
    const checkedByKey = new Map(
      liveProducts
        .filter((entry) => entry.bought === true)
        .map((entry) => [entry.key, entry])
    )
    const unavailable = requestedKeys.filter((key) => !checkedByKey.has(key))
    if (unavailable.length > 0) {
      throw new ApplicationError(
        'conflict',
        'Some selected products are no longer available'
      )
    }

    const products = parsed.products.map((product) => {
      const live = checkedByKey.get(product.groceryKey)!
      return normalizeProduct({
        groceryKey: live.key,
        name: live.item,
        category: live.category,
        quantity: live.quantity ?? null,
        unit: live.unit ?? null
      })
    })

    const modelProducts = products.slice(0, MAX_MODEL_PRODUCTS)
    const productLimitWarning = products.length > modelProducts.length
      ? `Using ${modelProducts.length} of ${products.length} selected products so the chef can respond quickly.`
      : null
    const runId = this.createRunId()
    const withWarnings = (
      result: PersonalChefAgentResult,
      extraWarnings: string[] = []
    ): PersonalChefAgentResult => ({
      ...result,
      warnings: [
        ...(productLimitWarning ? [productLimitWarning] : []),
        ...extraWarnings,
        ...result.warnings
      ]
    })

    try {
      const result = await personalChefGraph(this.generator)({
        ...parsed,
        products: modelProducts,
        runId
      })
      return withWarnings(result)
    } catch (error) {
      if (error instanceof PersonalChefModelError) {
        const result = await personalChefGraph(createDeterministicChefGenerator())({
          ...parsed,
          products: modelProducts,
          runId
        })
        return withWarnings(result, [MODEL_FALLBACK_WARNING])
      }
      if (error instanceof ZodError) {
        throw new ApplicationError('upstream_failed', 'Personal chef returned invalid recipes', error)
      }
      throw error
    }
  }
}
