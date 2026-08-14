jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import {
  FirebaseAdminCatalogCommandRepository,
  OTHER_CATEGORY_KEY,
  OTHER_CATEGORY_NAME
} from './firebaseAdminCatalogCommandRepository.server'

const household = (overrides: Record<string, unknown> = {}) => ({
  categories: {
    dairy: { name: 'Dairy', color: '#fff', icon: 'milk', protected: false, order: 1 },
    [OTHER_CATEGORY_KEY]: {
      name: OTHER_CATEGORY_NAME, color: '#aaa', icon: 'pin', protected: true, order: 16
    }
  },
  groceries: {
    groceryMatch: { category: 'Dairy' },
    groceryOther: { category: 'Produce' }
  },
  stock: {
    stockMatch: { category: 'Dairy' },
    stockOther: { category: 'Produce' }
  },
  ...overrides
})

const repositoryFor = (value: unknown) => {
  const update = jest.fn()
  const get = jest.fn().mockResolvedValue({ val: () => value })
  const ref = jest.fn(() => ({ get, update }))
  return {
    repository: new FirebaseAdminCatalogCommandRepository({ ref } as any),
    ref,
    update
  }
}

describe('FirebaseAdminCatalogCommandRepository.deleteAndReassignToOthers', () => {
  it('commits category deletion and grocery/stock reassignment in one household update', async () => {
    const { repository, ref, update } = repositoryFor(household())

    await repository.deleteAndReassignToOthers('household-1', 'dairy')

    expect(ref).toHaveBeenCalledTimes(1)
    expect(ref).toHaveBeenCalledWith('users/household-1')
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({
      'categories/dairy': null,
      'groceries/groceryMatch/category': OTHER_CATEGORY_NAME,
      'stock/stockMatch/category': OTHER_CATEGORY_NAME
    })
    expect(JSON.stringify(update.mock.calls)).not.toContain('groceryOther')
    expect(JSON.stringify(update.mock.calls)).not.toContain('stockOther')
  })

  it('refuses to delete the protected current key other/display אחר', async () => {
    const { repository, update } = repositoryFor(household())

    await expect(repository.deleteAndReassignToOthers('household-1', OTHER_CATEGORY_KEY)).rejects.toEqual(
      expect.objectContaining({ code: 'conflict' })
    )
    expect(update).not.toHaveBeenCalled()
  })

  it.each([
    ['missing Others', household({ categories: {
      dairy: { name: 'Dairy', protected: false, color: '#fff', icon: 'milk', order: 1 }
    } })],
    ['invalid Others name', household({ categories: {
      dairy: { name: 'Dairy', protected: false, color: '#fff', icon: 'milk', order: 1 },
      other: { name: 'Other', protected: true, color: '#aaa', icon: 'pin', order: 16 }
    } })],
    ['duplicate Others', household({ categories: {
      dairy: { name: 'Dairy', protected: false, color: '#fff', icon: 'milk', order: 1 },
      other: { name: OTHER_CATEGORY_NAME, protected: true, color: '#aaa', icon: 'pin', order: 16 },
      duplicate: { name: OTHER_CATEGORY_NAME, protected: true, color: '#bbb', icon: 'pin', order: 17 }
    } })]
  ])('returns conflict and writes nothing for %s', async (_case, value) => {
    const { repository, update } = repositoryFor(value)

    await expect(repository.deleteAndReassignToOthers('household-1', 'dairy')).rejects.toEqual(
      expect.objectContaining({ code: 'conflict' })
    )
    expect(update).not.toHaveBeenCalled()
  })
})
