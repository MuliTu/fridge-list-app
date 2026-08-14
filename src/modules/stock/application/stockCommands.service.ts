import type { ListAuthorizationRepository } from '../../groceries'
import { ApplicationError, type RequestContext } from '../../shared'
import type { NewStockRecord, StockPatch, StockRecord, StockRepository } from './stockRepository'

const text = (value: unknown, field: string, max: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new ApplicationError('invalid_input', `${field} must contain 1-${max} characters`)
  }
  return value.trim()
}

const amount = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) {
    throw new ApplicationError('invalid_input', `${field} must be a finite non-negative number`)
  }
  return value
}

const normalizeName = (value: string): string => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')

export type CreateStockInput = {
  name: unknown
  category: unknown
  quantity: unknown
  unit: unknown
  lowThreshold: unknown
}

export type UpdateStockInput = Partial<CreateStockInput>

export class StockCommandService {
  constructor(
    private readonly repository: StockRepository,
    private readonly authorization: ListAuthorizationRepository
  ) {}

  private async authorize(context: RequestContext, listId: unknown): Promise<string> {
    const normalizedListId = text(listId, 'listId', 200)
    await this.authorization.assertAccessible(context.principal, normalizedListId)
    return normalizedListId
  }

  private actor(context: RequestContext): string | null {
    return context.principal.kind === 'user' ? context.principal.email : context.principal.service
  }

  async create(context: RequestContext, listId: unknown, input: CreateStockInput): Promise<{ key: string }> {
    const authorizedListId = await this.authorize(context, listId)
    const record: NewStockRecord = {
      name: text(input.name, 'name', 200),
      category: text(input.category, 'category', 100),
      quantity: amount(input.quantity, 'quantity'),
      unit: text(input.unit, 'unit', 40),
      low_threshold: amount(input.lowThreshold, 'lowThreshold'),
      updated_at: context.now.toISOString(),
      updated_by: this.actor(context)
    }
    return { key: await this.repository.insert(authorizedListId, record) }
  }

  async update(
    context: RequestContext,
    listId: unknown,
    stockId: unknown,
    input: UpdateStockInput
  ): Promise<void> {
    const authorizedListId = await this.authorize(context, listId)
    const patch: StockPatch = {
      updated_at: context.now.toISOString(),
      updated_by: this.actor(context)
    }
    if (input.name !== undefined) patch.name = text(input.name, 'name', 200)
    if (input.category !== undefined) patch.category = text(input.category, 'category', 100)
    if (input.quantity !== undefined) patch.quantity = amount(input.quantity, 'quantity')
    if (input.unit !== undefined) patch.unit = text(input.unit, 'unit', 40)
    if (input.lowThreshold !== undefined) patch.low_threshold = amount(input.lowThreshold, 'lowThreshold')
    if (Object.keys(patch).length === 2) {
      throw new ApplicationError('invalid_input', 'at least one stock field is required')
    }
    await this.repository.update(authorizedListId, text(stockId, 'stockId', 200), patch)
  }

  async delete(context: RequestContext, listId: unknown, stockId: unknown): Promise<void> {
    const authorizedListId = await this.authorize(context, listId)
    await this.repository.delete(authorizedListId, text(stockId, 'stockId', 200))
  }

  async suggestForGrocery(
    context: RequestContext,
    listId: unknown,
    groceryName: unknown
  ): Promise<StockRecord | null> {
    const authorizedListId = await this.authorize(context, listId)
    const target = normalizeName(text(groceryName, 'groceryName', 200))
    const records = await this.repository.list(authorizedListId)
    return records.find((record) => normalizeName(record.name) === target) ?? null
  }
}
