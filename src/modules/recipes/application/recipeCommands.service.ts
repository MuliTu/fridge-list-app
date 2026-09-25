import { ApplicationError, type RequestContext } from '../../shared'
import type { ListAuthorizationRepository } from '../../groceries'
import {
  recipeRecordSchema,
  saveRecipeInputSchema,
  type SaveRecipeInput
} from '../domain/recipeSchemas'
import type { RecipeRepository } from './recipeRepository'

export class RecipeCommandService {
  constructor(
    private readonly repository: RecipeRepository,
    private readonly authorization: ListAuthorizationRepository
  ) {}

  private actor(context: RequestContext): string | null {
    return context.principal.kind === 'user'
      ? context.principal.email
      : context.principal.service
  }

  async save(
    context: RequestContext,
    input: unknown
  ): Promise<{ key: string }> {
    const parsed: SaveRecipeInput = saveRecipeInputSchema.parse(input)
    await this.authorization.assertAccessible(context.principal, parsed.listId)

    const record = recipeRecordSchema.omit({ key: true }).parse({
      ...parsed.recipe,
      createdAt: context.now.toISOString(),
      createdBy: this.actor(context),
      listId: parsed.listId
    })

    try {
      return { key: await this.repository.insert(parsed.listId, record) }
    } catch (error) {
      if (error instanceof ApplicationError) throw error
      throw new ApplicationError('upstream_failed', 'Recipe save failed', error)
    }
  }
}
