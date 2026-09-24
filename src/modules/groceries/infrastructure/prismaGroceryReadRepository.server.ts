import '@tanstack/react-start/server-only'

import { ApplicationError } from '../../shared'
import type {
  GroceryReadRecord,
  GroceryReadRepository
} from '../application/groceryReadRepository'

type PrismaGroceryRow = {
  id: string
  item: string
  category: string
  bought: boolean
  addedAt: Date
  rawText: string | null
  note: string | null
  imageUrl: string | null
  imageRef: string | null
  modifiedAt: Date | null
  modifiedBy: string | null
  listName: string | null
  createdBy: string | null
  quantity: number | null
  unit: string | null
}

type PrismaGroceryReadClient = {
  groceryItem: {
    findMany(args: {
      where: { listId: string }
      orderBy: [{ bought: 'asc' }, { addedAt: 'desc' }]
    }): Promise<PrismaGroceryRow[]>
  }
}

const listId = (value: string): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    throw new ApplicationError('invalid_input', 'listId is invalid')
  }
  return value.trim()
}

const toRecord = (row: PrismaGroceryRow): GroceryReadRecord => ({
  key: row.id,
  item: row.item,
  category: row.category,
  bought: row.bought,
  added_at: row.addedAt.toISOString(),
  raw_text: row.rawText,
  note: row.note,
  image_url: row.imageUrl,
  image_ref: row.imageRef,
  modified_at: row.modifiedAt?.toISOString() ?? null,
  modified_by: row.modifiedBy,
  list_name: row.listName,
  created_by: row.createdBy,
  quantity: row.quantity,
  unit: row.unit
})

export class PrismaGroceryReadRepository implements GroceryReadRepository {
  constructor(private readonly prisma: PrismaGroceryReadClient) {}

  async list(value: string): Promise<GroceryReadRecord[]> {
    const rows = await this.prisma.groceryItem.findMany({
      where: { listId: listId(value) },
      orderBy: [{ bought: 'asc' }, { addedAt: 'desc' }]
    })
    return rows.map(toRecord)
  }
}
