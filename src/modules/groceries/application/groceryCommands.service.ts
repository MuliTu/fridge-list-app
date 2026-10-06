import { ApplicationError, type RequestContext } from '../../shared'
import type { GroceryPatch, GroceryRepository, NewGroceryRecord } from './groceryWriteRepository'
import type { ListAuthorizationRepository } from './listAuthorizationRepository'

const limits = { item: 200, category: 100, note: 2_000, unit: 40, listName: 100 } as const

const text = (value: unknown, field: string, max: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new ApplicationError('invalid_input', `${field} must contain 1-${max} characters`)
  }
  return value.trim()
}

const nullableText = (value: unknown, field: string, max: number): string | null =>
  value == null || value === '' ? null : text(value, field, max)

const itemKey = (value: unknown): string => text(value, 'itemId', 200)

const quantity = (value: unknown): number | null => {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) {
    throw new ApplicationError('invalid_input', 'quantity must be a finite non-negative number')
  }
  return value
}

export type AddGroceryInput = {
  operationId?: unknown
  name: unknown
  category: unknown
  listName?: unknown
  quantity?: unknown
  unit?: unknown
}

export type UpdateGroceryInput = {
  name?: unknown
  category?: unknown
  listName?: unknown
}

export type UpdateGroceryDetailsInput = {
  name?: unknown
  note?: unknown
  quantity?: unknown
  unit?: unknown
}

export class GroceryCommandService {
  constructor(
    private readonly repository: GroceryRepository,
    private readonly authorization: ListAuthorizationRepository
  ) {}

  private async authorize(context: RequestContext, listId: string): Promise<string> {
    const normalizedListId = text(listId, 'listId', 200)
    await this.authorization.assertAccessible(context.principal, normalizedListId, 'write')
    return normalizedListId
  }

  private actor(context: RequestContext): string | null {
    return context.principal.kind === 'user' ? context.principal.email : context.principal.service
  }

  async add(context: RequestContext, listId: string, input: AddGroceryInput): Promise<{ key: string }> {
    const authorizedListId = await this.authorize(context, listId)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApplicationError('invalid_input', 'Grocery input must be an object')
    const record: NewGroceryRecord = {
      item: text(input.name, 'name', limits.item),
      category: text(input.category, 'category', limits.category),
      bought: false,
      added_at: context.now.toISOString(),
      raw_text: 'נוסף ידנית',
      list_name: nullableText(input.listName, 'listName', limits.listName),
      created_by: this.actor(context),
      quantity: quantity(input.quantity),
      unit: nullableText(input.unit, 'unit', limits.unit)
    }
    if (input.operationId !== undefined) {
      const operationId = text(input.operationId, 'operationId', 100)
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(operationId)) throw new ApplicationError('invalid_input', 'Invalid operationId')
      const actor = context.principal.kind === 'user' ? context.principal.uid : context.principal.service
      return { key: await this.repository.insertIdempotent(authorizedListId, `${actor}:${operationId}`, record) }
    }
    return { key: await this.repository.insert(authorizedListId, record) }
  }

  async update(context: RequestContext, listId: string, id: unknown, input: UpdateGroceryInput): Promise<void> {
    const authorizedListId = await this.authorize(context, listId)
    const patch: GroceryPatch = {
      modified_at: context.now.toISOString(),
      modified_by: this.actor(context)
    }
    if (input.name !== undefined) patch.item = text(input.name, 'name', limits.item)
    if (input.category !== undefined) patch.category = text(input.category, 'category', limits.category)
    if (input.listName !== undefined) patch.list_name = nullableText(input.listName, 'listName', limits.listName)
    if (Object.keys(patch).length === 2) throw new ApplicationError('invalid_input', 'at least one field is required')
    await this.repository.update(authorizedListId, itemKey(id), patch)
  }

  async setPurchased(context: RequestContext, listId: string, id: unknown, bought: unknown): Promise<void> {
    const authorizedListId = await this.authorize(context, listId)
    if (typeof bought !== 'boolean') throw new ApplicationError('invalid_input', 'bought must be a boolean')
    await this.repository.update(authorizedListId, itemKey(id), {
      bought,
      modified_at: context.now.toISOString(),
      modified_by: this.actor(context)
    })
  }

  async updateDetails(
    context: RequestContext,
    listId: string,
    id: unknown,
    input: UpdateGroceryDetailsInput
  ): Promise<void> {
    const authorizedListId = await this.authorize(context, listId)
    const patch: GroceryPatch = {
      modified_at: context.now.toISOString(),
      modified_by: this.actor(context)
    }
    if (input.name !== undefined) patch.item = text(input.name, 'name', limits.item)
    if (input.note !== undefined) patch.note = nullableText(input.note, 'note', limits.note)
    if (input.quantity !== undefined) patch.quantity = quantity(input.quantity)
    if (input.unit !== undefined) patch.unit = nullableText(input.unit, 'unit', limits.unit)
    if (Object.keys(patch).length === 2) throw new ApplicationError('invalid_input', 'at least one detail is required')
    await this.repository.update(authorizedListId, itemKey(id), patch)
  }

  async delete(context: RequestContext, listId: string, id: unknown): Promise<void> {
    const authorizedListId = await this.authorize(context, listId)
    await this.repository.delete(authorizedListId, itemKey(id))
  }
}
