import { PersistN8nGroceryService } from '../../../../src/modules/groceries/application/persistN8nGrocery.service'
import type { GroceryWriteRepository } from '../../../../src/modules/groceries/application/groceryWriteRepository'

const createRepository = (): jest.Mocked<GroceryWriteRepository> => ({
  insert: jest.fn(),
  insertIdempotent: jest.fn(),
  reactivate: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
})

describe('PersistN8nGroceryService', () => {
  it('inserts only the supported grocery fields', async () => {
    const repository = createRepository()
    repository.insert.mockResolvedValue('new-key')

    const result = await new PersistN8nGroceryService(repository).execute('allowed-list', {
      action: 'insert',
      item: '  Milk  ',
      category: '  Dairy  ',
      added_at: '2026-08-02T10:30:00.000Z',
      raw_text: '  add milk  ',
      created_by: null
    })

    expect(repository.insert).toHaveBeenCalledWith('allowed-list', {
      item: 'Milk',
      category: 'Dairy',
      added_at: '2026-08-02T10:30:00.000Z',
      raw_text: 'add milk',
      bought: false,
      created_by: null
    })
    expect(repository.reactivate).not.toHaveBeenCalled()
    expect(result).toEqual({ action: 'insert', key: 'new-key' })
  })

  it('reactivates by key without forwarding insert fields', async () => {
    const repository = createRepository()

    const result = await new PersistN8nGroceryService(repository).execute('allowed-list', {
      action: 'update',
      key: 'existing-key',
      added_at: '2026-08-02T10:30:00Z'
    })

    expect(repository.reactivate).toHaveBeenCalledWith('allowed-list', 'existing-key', {
      bought: false,
      added_at: '2026-08-02T10:30:00Z'
    })
    expect(repository.insert).not.toHaveBeenCalled()
    expect(result).toEqual({ action: 'update', key: 'existing-key' })
  })

  it('uses a stable repository write when an integration idempotency key is supplied', async () => {
    const repository = createRepository()
    repository.insertIdempotent.mockResolvedValue('integration-key')

    const result = await new PersistN8nGroceryService(repository).execute('allowed-list', {
      action: 'insert',
      item: 'Milk',
      category: 'Dairy',
      added_at: '2026-08-02T10:30:00Z',
      idempotency_key: 'workflow-run-42'
    })

    expect(repository.insertIdempotent).toHaveBeenCalledWith(
      'allowed-list',
      'workflow-run-42',
      expect.objectContaining({ item: 'Milk', bought: false })
    )
    expect(repository.insert).not.toHaveBeenCalled()
    expect(result).toEqual({ action: 'insert', key: 'integration-key' })
  })

  it.each([
    { field: 'item', command: { action: 'insert', item: '', category: 'Dairy', added_at: '2026-08-02T10:30:00Z' } },
    { field: 'category', command: { action: 'insert', item: 'Milk', category: null, added_at: '2026-08-02T10:30:00Z' } },
    { field: 'timestamp', command: { action: 'update', key: 'item-key', added_at: '2026-08-02' } }
  ])('rejects invalid $field input before persistence', async ({ command }) => {
    const repository = createRepository()
    const service = new PersistN8nGroceryService(repository)

    await expect(service.execute('allowed-list', command as any)).rejects.toMatchObject({ code: 'invalid_input' })
    expect(repository.insert).not.toHaveBeenCalled()
    expect(repository.reactivate).not.toHaveBeenCalled()
  })
})
