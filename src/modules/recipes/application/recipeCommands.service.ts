import { ZodError } from 'zod'
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
    let parsed: SaveRecipeInput
    try {
      parsed = saveRecipeInputSchema.parse(input)
    } catch (error) {
      if (error instanceof ZodError) throw new ApplicationError('invalid_input', 'Recipe save request is invalid')
      throw error
    }
    await this.authorization.assertAccessible(context.principal, parsed.listId, 'write')

    if (context.principal.kind !== 'user') throw new ApplicationError('forbidden', 'Only users can save recipes')
    const record = recipeRecordSchema.omit({ key: true }).parse({
      ...parsed.recipe,
      createdAt: context.now.toISOString(),
      createdBy: this.actor(context),
      listId: parsed.listId
    })

    try {
      return { key: await this.repository.insert(parsed.listId, record, {
        uid: context.principal.uid, id: parsed.operationId, intent: parsed.recipe
      }) }
    } catch (error) {
      if (error instanceof ApplicationError) throw error
      throw new ApplicationError('upstream_failed', 'Recipe save failed', error)
    }
  }
}
