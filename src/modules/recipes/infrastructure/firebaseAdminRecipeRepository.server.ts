import '@tanstack/react-start/server-only'

import type { App } from 'firebase-admin/app'
import { getDatabaseWithUrl, type Database } from 'firebase-admin/database'

import type { GroceryItem } from '../../../types'
import { ApplicationError, type AuthenticatedPrincipal } from '../../shared'
import type { ListAuthorizationRepository } from '../../groceries'
import type { RecipeRecordInput } from '../domain/recipeSchemas'
import type { ChefGroceryRepository, RecipeRepository } from '../application/recipeRepository'

const invalidKey = /[.#$/[\]\u0000-\u001f\u007f]/

const sanitizeEmailKey = (email: string): string =>
  email.trim().toLowerCase().replace(/[.#$[\]]/g, '_')

const key = (value: string, field: string): string => {
  if (!value || value.length > 200 || value.trim() !== value || invalidKey.test(value)) {
    throw new ApplicationError('invalid_input', `${field} is not a valid Firebase key`)
  }
  return value
}

const mapFailure = (message: string, error: unknown): never => {
  if (error instanceof ApplicationError) throw error
  throw new ApplicationError('upstream_failed', message, error)
}

const grantsMembership = (value: unknown): boolean => {
  if (value === 'pending' || value === 'approved') return true
  if (value && typeof value === 'object') {
    const status = (value as { status?: unknown }).status
    return status === 'pending' || status === 'approved'
  }
  return false
}

export class FirebaseAdminListAuthorizationRepository implements ListAuthorizationRepository {
  constructor(private readonly database: Database) {}

  async assertAccessible(principal: AuthenticatedPrincipal, listId: string): Promise<void> {
    if (principal.kind !== 'user') {
      throw new ApplicationError('forbidden', 'Only signed-in users can access recipes')
    }
    try {
      const listKey = key(listId, 'listId')
      const snapshot = await this.database.ref(`users/${listKey}`).get()
      if (!snapshot.exists()) throw new ApplicationError('not_found', 'List not found')
      const list = snapshot.val() as
        | {
            ownerUid?: unknown
            members?: Record<string, unknown>
            invites?: Record<string, unknown>
          }
        | null

      const userKey = principal.email ? sanitizeEmailKey(principal.email) : null
      if (userKey === listKey) return
      if (list?.ownerUid === principal.uid) return
      if (grantsMembership(list?.members?.[principal.uid])) return
      if (userKey && grantsMembership(list?.invites?.[userKey])) return

      if (userKey) {
        const membershipSnapshot = await this.database.ref(`users/${userKey}/memberOf/${listKey}`).get()
        if (grantsMembership(membershipSnapshot.val())) return
      }

      throw new ApplicationError('forbidden', 'User cannot access this list')
    } catch (error) {
      mapFailure('Firebase list authorization read failed', error)
    }
  }
}

export class FirebaseAdminRecipeRepository implements RecipeRepository, ChefGroceryRepository {
  constructor(private readonly database: Database) {}

  async insert(listId: string, record: Omit<RecipeRecordInput, 'key'>): Promise<string> {
    try {
      const reference = this.database.ref(`users/${key(listId, 'listId')}/recipes`).push()
      if (!reference.key) {
        throw new ApplicationError('upstream_failed', 'Firebase did not allocate a recipe key')
      }
      await reference.set(record)
      return reference.key
    } catch (error) {
      return mapFailure('Firebase recipe insert failed', error)
    }
  }

  async getGroceriesByKeys(listId: string, keys: readonly string[]): Promise<GroceryItem[]> {
    try {
      const uniqueKeys = Array.from(new Set(keys.map((itemKey) => key(itemKey, 'groceryKey'))))
      const snapshots = await Promise.all(
        uniqueKeys.map(async (itemKey) => {
          const snapshot = await this.database.ref(`users/${key(listId, 'listId')}/groceries/${itemKey}`).get()
          return [itemKey, snapshot.val()] as const
        })
      )
      return snapshots
        .filter(([, value]) => value && typeof value === 'object')
        .map(([itemKey, value]) => ({ key: itemKey, ...(value as Omit<GroceryItem, 'key'>) }))
    } catch (error) {
      return mapFailure('Firebase grocery availability read failed', error)
    }
  }
}

export const createFirebaseAdminRecipeRepository = (
  app: App,
  databaseUrl: string
): FirebaseAdminRecipeRepository =>
  new FirebaseAdminRecipeRepository(getDatabaseWithUrl(databaseUrl, app))

export const createFirebaseAdminListAuthorizationRepository = (
  app: App,
  databaseUrl: string
): FirebaseAdminListAuthorizationRepository =>
  new FirebaseAdminListAuthorizationRepository(getDatabaseWithUrl(databaseUrl, app))
