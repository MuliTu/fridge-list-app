import '@tanstack/react-start/server-only'

import type { App } from 'firebase-admin/app'
import { getDatabase, type Database } from 'firebase-admin/database'

import { ApplicationError } from '../../shared'
import type {
  CatalogCommandRepository,
  CategoryPatch,
  CategoryRecord,
  NewCategoryRecord
} from '../application/catalogCommandRepository'

export const OTHER_CATEGORY_KEY = 'other'
export const OTHER_CATEGORY_NAME = 'אחר'

const invalidKey = /[.#$/[\]\u0000-\u001f\u007f]/
const key = (value: string, field: string): string => {
  if (!value || value.length > 200 || value.trim() !== value || invalidKey.test(value)) {
    throw new ApplicationError('invalid_input', `${field} is not a valid Firebase key`)
  }
  return value
}

type HouseholdSnapshot = {
  categories?: Record<string, Omit<CategoryRecord, 'key'>>
  groceries?: Record<string, { category?: unknown }>
  stock?: Record<string, { category?: unknown }>
}

export class FirebaseAdminCatalogCommandRepository implements CatalogCommandRepository {
  constructor(private readonly database: Database) {}

  async insert(listId: string, category: NewCategoryRecord): Promise<string> {
    const reference = this.database.ref(`users/${key(listId, 'listId')}/categories`).push()
    if (!reference.key) throw new ApplicationError('upstream_failed', 'Firebase did not allocate a category key')
    await reference.set(category)
    return reference.key
  }

  async update(listId: string, categoryId: string, patch: CategoryPatch): Promise<void> {
    await this.database.ref(
      `users/${key(listId, 'listId')}/categories/${key(categoryId, 'categoryId')}`
    ).update(patch)
  }

  async reorder(listId: string, orders: Readonly<Record<string, number>>): Promise<void> {
    const updates: Record<string, number> = {}
    for (const [categoryId, order] of Object.entries(orders)) {
      updates[`categories/${key(categoryId, 'categoryId')}/order`] = order
    }
    await this.database.ref(`users/${key(listId, 'listId')}`).update(updates)
  }

  async deleteAndReassignToOthers(listId: string, categoryId: string): Promise<void> {
    const household = this.database.ref(`users/${key(listId, 'listId')}`)
    const snapshot = await household.get()
    const value = (snapshot.val() ?? {}) as HouseholdSnapshot
    const categories = value.categories ?? {}
    const target = categories[key(categoryId, 'categoryId')]
    if (!target) throw new ApplicationError('not_found', 'Category does not exist')
    if (target.protected) throw new ApplicationError('conflict', 'Protected categories cannot be deleted')

    const fallbacks = Object.entries(categories).filter(
      ([candidateKey, category]) =>
        category.protected === true &&
        (candidateKey === OTHER_CATEGORY_KEY || category.name === OTHER_CATEGORY_NAME)
    )
    if (
      fallbacks.length !== 1 ||
      fallbacks[0][0] !== OTHER_CATEGORY_KEY ||
      fallbacks[0][1].name !== OTHER_CATEGORY_NAME
    ) {
      throw new ApplicationError('conflict', 'Protected Others category is missing, duplicated, or invalid')
    }

    const updates: Record<string, string | null> = {
      [`categories/${categoryId}`]: null
    }
    for (const [groceryId, grocery] of Object.entries(value.groceries ?? {})) {
      if (grocery.category === target.name) updates[`groceries/${groceryId}/category`] = OTHER_CATEGORY_NAME
    }
    for (const [stockId, stock] of Object.entries(value.stock ?? {})) {
      if (stock.category === target.name) updates[`stock/${stockId}/category`] = OTHER_CATEGORY_NAME
    }
    await household.update(updates)
  }
}

export const createFirebaseAdminCatalogCommandRepository = (app: App): FirebaseAdminCatalogCommandRepository =>
  new FirebaseAdminCatalogCommandRepository(getDatabase(app))
