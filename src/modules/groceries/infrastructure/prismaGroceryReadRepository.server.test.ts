/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { PrismaGroceryReadRepository } from './prismaGroceryReadRepository.server'

const row = {
  id: 'item-1',
  item: 'Milk',
  category: 'Dairy',
  bought: false,
  addedAt: new Date('2026-08-02T10:30:00.000Z'),
  rawText: 'manual',
  note: null,
  imageUrl: null,
  imageRef: null,
  modifiedAt: new Date('2026-08-02T11:00:00.000Z'),
  modifiedBy: 'user@example.test',
  listName: 'Home',
  createdBy: 'user@example.test',
  quantity: 2,
  unit: 'l'
}

describe('PrismaGroceryReadRepository', () => {
  it('reads list groceries and maps RDS fields to the current API shape', async () => {
    const prisma = {
      groceryItem: {
        findMany: jest.fn().mockResolvedValue([row])
      }
    }

    const result = await new PrismaGroceryReadRepository(prisma).list('list-1')

    expect(prisma.groceryItem.findMany).toHaveBeenCalledWith({
      where: { listId: 'list-1' },
      orderBy: [{ bought: 'asc' }, { addedAt: 'desc' }]
    })
    expect(result).toEqual([{
      key: 'item-1',
      item: 'Milk',
      category: 'Dairy',
      bought: false,
      added_at: '2026-08-02T10:30:00.000Z',
      raw_text: 'manual',
      note: null,
      image_url: null,
      image_ref: null,
      modified_at: '2026-08-02T11:00:00.000Z',
      modified_by: 'user@example.test',
      list_name: 'Home',
      created_by: 'user@example.test',
      quantity: 2,
      unit: 'l'
    }])
  })

  it('rejects invalid list IDs before querying', async () => {
    const prisma = {
      groceryItem: {
        findMany: jest.fn()
      }
    }

    await expect(new PrismaGroceryReadRepository(prisma).list(' ')).rejects.toEqual(
      expect.objectContaining({ code: 'invalid_input' })
    )
    expect(prisma.groceryItem.findMany).not.toHaveBeenCalled()
  })
})
