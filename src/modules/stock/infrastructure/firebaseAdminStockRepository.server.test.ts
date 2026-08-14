jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { FirebaseAdminStockRepository } from './firebaseAdminStockRepository.server'

describe('FirebaseAdminStockRepository', () => {
  it('preserves the RTDB stock path and record shape', async () => {
    const set = jest.fn()
    const push = jest.fn(() => ({ key: 'stock-1', set }))
    const ref = jest.fn(() => ({ push }))
    const repository = new FirebaseAdminStockRepository({ ref } as any)
    const record = {
      name: 'Milk', category: 'Dairy', quantity: 2, unit: 'pcs', low_threshold: 1,
      updated_at: '2026-08-02T10:00:00Z', updated_by: 'user@example.com'
    }

    await expect(repository.insert('list-1', record)).resolves.toBe('stock-1')
    expect(ref).toHaveBeenCalledWith('users/list-1/stock')
    expect(set).toHaveBeenCalledWith(record)
  })

  it('reads provider records as keyed stock DTOs', async () => {
    const get = jest.fn().mockResolvedValue({ val: () => ({
      one: { name: 'Milk', category: 'Dairy', quantity: 1, unit: 'pcs', low_threshold: 1,
        updated_at: '2026-08-02T10:00:00Z', updated_by: null }
    }) })
    const repository = new FirebaseAdminStockRepository({ ref: jest.fn(() => ({ get })) } as any)

    await expect(repository.list('list-1')).resolves.toEqual([
      { key: 'one', name: 'Milk', category: 'Dairy', quantity: 1, unit: 'pcs', low_threshold: 1,
        updated_at: '2026-08-02T10:00:00Z', updated_by: null }
    ])
  })
})
