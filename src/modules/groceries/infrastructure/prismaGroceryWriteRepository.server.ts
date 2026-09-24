import '@tanstack/react-start/server-only'

import { createHash, randomUUID } from 'node:crypto'
import { ApplicationError } from '../../shared'
import type {
  GroceryPatch,
  GroceryWriteRepository,
  NewGroceryRecord,
  ReactivateGroceryRecord
} from '../application/groceryWriteRepository'

type GroceryCreateData = {
  id: string
  listId: string
  item: string
  category: string
  bought: boolean
  addedAt: Date
  rawText: string | null
  createdBy: string | null
  listName?: string | null
  quantity?: number | null
  unit?: string | null
  modifiedAt?: Date
  modifiedBy?: string | null
}

type GroceryUpdateData = Partial<Omit<GroceryCreateData, 'id' | 'listId'>>

type PrismaGroceryClient = {
  groceryItem: {
    create(args: { data: GroceryCreateData }): Promise<{ id: string }>
    upsert(args: {
      where: { id: string }
      create: GroceryCreateData
      update: GroceryUpdateData
    }): Promise<{ id: string }>
    update(args: {
      where: { id: string; listId: string }
      data: GroceryUpdateData
    }): Promise<{ id: string }>
    delete(args: { where: { id: string; listId: string } }): Promise<{ id: string }>
  }
}

const id = (value: string, field: string): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    throw new ApplicationError('invalid_input', `${field} is invalid`)
  }
  return value.trim()
}

const date = (value: string | undefined, field: string): Date | undefined => {
  if (value === undefined) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new ApplicationError('invalid_input', `${field} is invalid`)
  }
  return parsed
}

const createData = (
  listId: string,
  itemId: string,
  record: NewGroceryRecord
): GroceryCreateData => ({
  id: itemId,
  listId,
  item: record.item,
  category: record.category,
  bought: record.bought,
  addedAt: date(record.added_at, 'added_at') ?? new Date(),
  rawText: record.raw_text,
  createdBy: record.created_by,
  ...(record.list_name === undefined ? {} : { listName: record.list_name }),
  ...(record.quantity === undefined ? {} : { quantity: record.quantity }),
  ...(record.unit === undefined ? {} : { unit: record.unit }),
  ...(record.modified_at === undefined ? {} : { modifiedAt: date(record.modified_at, 'modified_at') }),
  ...(record.modified_by === undefined ? {} : { modifiedBy: record.modified_by })
})

type RdsGroceryPatch = {
  bought?: boolean
  added_at?: string
  item?: string
  category?: string
  list_name?: string | null
  quantity?: number | null
  unit?: string | null
  note?: string | null
  modified_at?: string
  modified_by?: string | null
}

const updateData = (patch: RdsGroceryPatch): GroceryUpdateData => ({
  ...(patch.bought === undefined ? {} : { bought: patch.bought }),
  ...(patch.added_at === undefined ? {} : { addedAt: date(patch.added_at, 'added_at') }),
  ...(patch.item === undefined ? {} : { item: patch.item }),
  ...(patch.category === undefined ? {} : { category: patch.category }),
  ...(patch.list_name === undefined ? {} : { listName: patch.list_name }),
  ...(patch.quantity === undefined ? {} : { quantity: patch.quantity }),
  ...(patch.unit === undefined ? {} : { unit: patch.unit }),
  ...(patch.note === undefined ? {} : { note: patch.note }),
  ...(patch.modified_at === undefined ? {} : { modifiedAt: date(patch.modified_at, 'modified_at') }),
  ...(patch.modified_by === undefined ? {} : { modifiedBy: patch.modified_by })
})

const idempotencyId = (idempotencyKey: string): string => {
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 500) {
    throw new ApplicationError('invalid_input', 'idempotencyKey is invalid')
  }
  return `integration_${createHash('sha256').update(idempotencyKey, 'utf8').digest('hex').slice(0, 40)}`
}

export class PrismaGroceryWriteRepository implements GroceryWriteRepository {
  constructor(private readonly prisma: PrismaGroceryClient) {}

  async insert(listId: string, record: NewGroceryRecord): Promise<string> {
    const normalizedListId = id(listId, 'listId')
    const itemId = randomUUID()
    const created = await this.prisma.groceryItem.create({
      data: createData(normalizedListId, itemId, record)
    })
    return created.id
  }

  async insertIdempotent(
    listId: string,
    idempotencyKey: string,
    record: NewGroceryRecord
  ): Promise<string> {
    const normalizedListId = id(listId, 'listId')
    const itemId = idempotencyId(idempotencyKey)
    const data = createData(normalizedListId, itemId, record)
    const upserted = await this.prisma.groceryItem.upsert({
      where: { id: itemId },
      create: data,
      update: updateData(record)
    })
    return upserted.id
  }

  async reactivate(
    listId: string,
    itemKey: string,
    record: ReactivateGroceryRecord
  ): Promise<void> {
    await this.prisma.groceryItem.update({
      where: { id: id(itemKey, 'itemKey'), listId: id(listId, 'listId') },
      data: updateData(record)
    })
  }

  async update(listId: string, itemKey: string, patch: GroceryPatch): Promise<void> {
    await this.prisma.groceryItem.update({
      where: { id: id(itemKey, 'itemKey'), listId: id(listId, 'listId') },
      data: updateData(patch)
    })
  }

  async delete(listId: string, itemKey: string): Promise<void> {
    await this.prisma.groceryItem.delete({
      where: { id: id(itemKey, 'itemKey'), listId: id(listId, 'listId') }
    })
  }
}
