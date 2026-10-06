import '@tanstack/react-start/server-only'

import { createHash } from 'node:crypto'
import type { App } from 'firebase-admin/app'
import { getDatabaseWithUrl, type Database } from 'firebase-admin/database'

import type { GroceryItem } from '../../../types'
import { ApplicationError, type AuthenticatedPrincipal } from '../../shared'
import type { ListAuthorizationRepository } from '../../groceries'
import type { RecipeRecordInput } from '../domain/recipeSchemas'
import type { ChefGroceryRepository, RecipeRepository } from '../application/recipeRepository'

const invalidKey = /[.#$/[\]\u0000-\u001f\u007f]/

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

const grantsMembership = (value: unknown, access: 'read' | 'write'): boolean => {
  if (value && typeof value === 'object') {
    const status = (value as { status?: unknown }).status
    return status === 'approved' && (access === 'read' || (value as { role?: unknown }).role === 'editor')
  }
  return false
}

export class FirebaseAdminListAuthorizationRepository implements ListAuthorizationRepository {
  constructor(private readonly database: Database) {}

  async assertAccessible(principal: AuthenticatedPrincipal, listId: string, access: 'read' | 'write' = 'read'): Promise<void> {
    if (principal.kind !== 'user') {
      throw new ApplicationError('forbidden', 'Only signed-in users can access recipes')
    }
    try {
      const listKey = key(listId, 'listId')
      // Read only the authorization records; household contents never enter this check.
      const [owner, member] = await Promise.all([
        this.database.ref(`users/${listKey}/ownerUid`).get(),
        this.database.ref(`users/${listKey}/members/${key(principal.uid, 'uid')}`).get()
      ])
      if (owner.val() === principal.uid) return
      if (grantsMembership(member.val(), access)) return

      throw new ApplicationError('forbidden', 'User cannot access this list')
    } catch (error) {
      mapFailure('Firebase list authorization read failed', error)
    }
  }
}

export class FirebaseAdminRecipeRepository implements RecipeRepository, ChefGroceryRepository {
  constructor(private readonly database: Database) {}

  async insert(
    listId: string,
    record: Omit<RecipeRecordInput, 'key'>,
    operation: { uid: string; id: string; intent: unknown }
  ): Promise<string> {
    try {
      const digest = (value: string) => createHash('sha256').update(value).digest('hex')
      const recipeKey = `saved_${digest(JSON.stringify([operation.uid, operation.id]))}`
      const fingerprint = digest(JSON.stringify(operation.intent))
      const reference = this.database.ref(`users/${key(listId, 'listId')}/recipes/${recipeKey}`)
      const result = await reference.transaction((current) => {
        if (current === null) return { ...record, saveOperation: { fingerprint, version: 1 } }
        return current.saveOperation?.fingerprint === fingerprint ? current : undefined
      })
      if (!result.committed) throw new ApplicationError('conflict', 'Save operation already belongs to a different recipe')
      return recipeKey
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
