import { ApplicationError, type RequestContext } from '../../shared'
import type { CatalogAuthorizationRepository } from './catalogAuthorizationRepository'
import type {
  CatalogCommandRepository,
  CategoryPatch,
  NewCategoryRecord
} from './catalogCommandRepository'

const OTHER_CATEGORY_KEY = 'other'
const OTHER_CATEGORY_NAME = 'אחר'

const text = (value: unknown, field: string, max: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new ApplicationError('invalid_input', `${field} must contain 1-${max} characters`)
  }
  return value.trim()
}

const categoryId = (value: unknown): string => text(value, 'categoryId', 200)

const order = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10_000) {
    throw new ApplicationError('invalid_input', 'order must be a non-negative integer')
  }
  return value as number
}

export type CreateCategoryInput = {
  name: unknown
  color: unknown
  icon?: unknown
  order: unknown
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>

export class CatalogCommandService {
  constructor(
    private readonly repository: CatalogCommandRepository,
    private readonly authorization: CatalogAuthorizationRepository
  ) {}

  private async accessible(context: RequestContext, listId: unknown): Promise<string> {
    const id = text(listId, 'listId', 200)
    await this.authorization.assertAccessible(context.principal, id)
    return id
  }

  async create(
    context: RequestContext,
    listId: unknown,
    input: CreateCategoryInput
  ): Promise<{ key: string }> {
    const id = await this.accessible(context, listId)
    const name = text(input.name, 'name', 100)
    if (name === OTHER_CATEGORY_NAME) {
      throw new ApplicationError('conflict', 'Protected Others category already exists')
    }
    const record: NewCategoryRecord = {
      name,
      color: text(input.color, 'color', 100),
      icon: input.icon == null || input.icon === '' ? '📌' : text(input.icon, 'icon', 32),
      order: order(input.order),
      protected: false
    }
    return { key: await this.repository.insert(id, record) }
  }

  async update(
    context: RequestContext,
    listId: unknown,
    id: unknown,
    input: UpdateCategoryInput
  ): Promise<void> {
    const list = await this.accessible(context, listId)
    const key = categoryId(id)
    if (key === OTHER_CATEGORY_KEY) {
      throw new ApplicationError('conflict', 'Protected Others category cannot be changed')
    }
    const patch: CategoryPatch = {}
    if (input.name !== undefined) {
      patch.name = text(input.name, 'name', 100)
      if (patch.name === OTHER_CATEGORY_NAME) {
        throw new ApplicationError('conflict', 'Protected Others category already exists')
      }
    }
    if (input.color !== undefined) patch.color = text(input.color, 'color', 100)
    if (input.icon !== undefined) patch.icon = text(input.icon, 'icon', 32)
    if (input.order !== undefined) patch.order = order(input.order)
    if (!Object.keys(patch).length) throw new ApplicationError('invalid_input', 'at least one category field is required')
    await this.repository.update(list, key, patch)
  }

  async reorder(
    context: RequestContext,
    listId: unknown,
    categoryOrders: unknown
  ): Promise<void> {
    const list = await this.accessible(context, listId)
    if (!categoryOrders || typeof categoryOrders !== 'object' || Array.isArray(categoryOrders)) {
      throw new ApplicationError('invalid_input', 'category orders must be an object')
    }
    const entries = Object.entries(categoryOrders as Record<string, unknown>)
    if (!entries.length || entries.length > 200) {
      throw new ApplicationError('invalid_input', 'category orders must contain 1-200 categories')
    }
    const normalized = Object.fromEntries(entries.map(([key, value]) => [categoryId(key), order(value)]))
    await this.repository.reorder(list, normalized)
  }

  async delete(context: RequestContext, listId: unknown, id: unknown): Promise<void> {
    const list = text(listId, 'listId', 200)
    // Check ownership before parsing the category ID to avoid disclosing validation
    // details for a list the caller does not own.
    await this.authorization.assertOwner(context.principal, list)
    const key = categoryId(id)
    if (key === OTHER_CATEGORY_KEY) {
      throw new ApplicationError('conflict', 'Protected Others category cannot be deleted')
    }
    await this.repository.deleteAndReassignToOthers(list, key)
  }
}
