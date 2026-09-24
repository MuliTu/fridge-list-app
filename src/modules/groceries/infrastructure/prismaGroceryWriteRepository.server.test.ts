/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

jest.mock('node:crypto', () => ({
  ...jest.requireActual('node:crypto'),
  randomUUID: jest.fn(() => 'generated-item-id')
}))

import { PrismaGroceryWriteRepository } from './prismaGroceryWriteRepository.server'

const record = {
  item: 'Milk',
  category: 'Dairy',
  added_at: '2026-08-02T10:30:00.000Z',
  raw_text: 'manual',
  bought: false,
  created_by: 'user@example.test',
  list_name: 'Home',
  quantity: 2,
  unit: 'l'
}

const createPrisma = () => ({
  groceryItem: {
    create: jest.fn().mockResolvedValue({ id: 'generated-item-id' }),
    upsert: jest.fn().mockResolvedValue({ id: 'integration-key' }),
    update: jest.fn().mockResolvedValue({ id: 'item-1' }),
    delete: jest.fn().mockResolvedValue({ id: 'item-1' })
  }
})

describe('PrismaGroceryWriteRepository', () => {
  it('inserts groceries with RDS field names and generated IDs', async () => {
    const prisma = createPrisma()
    const repository = new PrismaGroceryWriteRepository(prisma)

    await expect(repository.insert('list-1', record)).resolves.toBe('generated-item-id')

    expect(prisma.groceryItem.create).toHaveBeenCalledWith({
      data: {
        id: 'generated-item-id',
        listId: 'list-1',
        item: 'Milk',
        category: 'Dairy',
        bought: false,
        addedAt: new Date('2026-08-02T10:30:00.000Z'),
        rawText: 'manual',
        createdBy: 'user@example.test',
        listName: 'Home',
        quantity: 2,
        unit: 'l'
      }
    })
  })

  it('upserts n8n idempotent groceries with deterministic IDs', async () => {
    const prisma = createPrisma()
    const repository = new PrismaGroceryWriteRepository(prisma)

    const key = await repository.insertIdempotent('list-1', 'source-event-1', record)

    expect(key).toBe('integration-key')
    expect(prisma.groceryItem.upsert).toHaveBeenCalledWith({
      where: { id: expect.stringMatching(/^integration_[0-9a-f]{40}$/) },
      create: expect.objectContaining({ listId: 'list-1', item: 'Milk' }),
      update: expect.objectContaining({ item: 'Milk', category: 'Dairy' })
    })
  })

  it('updates groceries using list-scoped where clauses', async () => {
    const prisma = createPrisma()
    const repository = new PrismaGroceryWriteRepository(prisma)

    await repository.update('list-1', 'item-1', {
      bought: true,
      modified_at: '2026-08-02T11:00:00.000Z',
      modified_by: 'user@example.test',
      note: null
    })

    expect(prisma.groceryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1', listId: 'list-1' },
      data: {
        bought: true,
        note: null,
        modifiedAt: new Date('2026-08-02T11:00:00.000Z'),
        modifiedBy: 'user@example.test'
      }
    })
  })

  it('reactivates groceries by clearing bought and replacing addedAt', async () => {
    const prisma = createPrisma()
    const repository = new PrismaGroceryWriteRepository(prisma)

    await repository.reactivate('list-1', 'item-1', {
      bought: false,
      added_at: '2026-08-02T12:00:00.000Z'
    })

    expect(prisma.groceryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1', listId: 'list-1' },
      data: {
        bought: false,
        addedAt: new Date('2026-08-02T12:00:00.000Z')
      }
    })
  })

  it('deletes groceries using list-scoped where clauses', async () => {
    const prisma = createPrisma()
    const repository = new PrismaGroceryWriteRepository(prisma)

    await repository.delete('list-1', 'item-1')

    expect(prisma.groceryItem.delete).toHaveBeenCalledWith({
      where: { id: 'item-1', listId: 'list-1' }
    })
  })

  it('rejects invalid identifiers and dates before querying', async () => {
    const prisma = createPrisma()
    const repository = new PrismaGroceryWriteRepository(prisma)

    await expect(repository.delete(' ', 'item-1')).rejects.toEqual(
      expect.objectContaining({ code: 'invalid_input' })
    )
    await expect(repository.insert('list-1', { ...record, added_at: 'not-a-date' })).rejects.toEqual(
      expect.objectContaining({ code: 'invalid_input' })
    )
    expect(prisma.groceryItem.create).not.toHaveBeenCalled()
    expect(prisma.groceryItem.delete).not.toHaveBeenCalled()
  })
})
