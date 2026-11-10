import '@tanstack/react-start/server-only'

import type { App } from 'firebase-admin/app'
import { getDatabaseWithUrl, type Database } from 'firebase-admin/database'

import { ApplicationError } from '../../shared'
import type { ListDeletionRepository } from '../application/listDeletion.service'

type GroceryRecord = { list_name?: unknown }
type HouseholdRecord = {
  ownerUid?: unknown
  groceries?: Record<string, GroceryRecord>
}

export class FirebaseAdminListDeletionRepository implements ListDeletionRepository {
  constructor(private readonly database: Database) {}

  async deleteCustomList(input: {
    listId: string
    listName: string
    actorUid: string
  }): Promise<{ deletedItems: number }> {
    const household = this.database.ref(`users/${input.listId}`)
    let rejection: ApplicationError | undefined
    let deletedItems = 0

    try {
      const result = await household.transaction((current: HouseholdRecord | null) => {
        rejection = undefined
        deletedItems = 0
        if (current === null) {
          // The Admin SDK may invoke the update function with an uncached null
          // before it reads an existing remote value. Returning null makes a
          // no-op compare-and-set, so a remote value triggers a retry with the
          // actual household. Returning undefined here would abort immediately.
          rejection = new ApplicationError('forbidden', 'Only the household owner can delete a shopping list')
          return null
        }
        if (current.ownerUid !== input.actorUid) {
          rejection = new ApplicationError('forbidden', 'Only the household owner can delete a shopping list')
          return undefined
        }

        const groceries = current.groceries ?? {}
        const matchingKeys = Object.entries(groceries)
          .filter(([, grocery]) => grocery?.list_name === input.listName)
          .map(([groceryId]) => groceryId)
        if (matchingKeys.length === 0) {
          rejection = new ApplicationError('not_found', 'Custom shopping list does not exist')
          return undefined
        }

        // The permanent list is always selectable and is represented by a
        // missing/null list_name. It remains after every custom-list deletion.
        // Re-evaluating the household in this transaction prevents a stale
        // client view from authorizing a broader or different deletion.
        const nextGroceries = { ...groceries }
        for (const groceryId of matchingKeys) delete nextGroceries[groceryId]
        deletedItems = matchingKeys.length
        return { ...current, groceries: nextGroceries }
      })

      if (!result.committed || rejection) throw rejection ?? new ApplicationError('conflict', 'Shopping list changed concurrently')
      return { deletedItems }
    } catch (error) {
      if (error instanceof ApplicationError) throw error
      throw new ApplicationError('upstream_failed', 'Shopping list deletion failed', error)
    }
  }
}

export const createFirebaseAdminListDeletionRepository = (
  app: App,
  databaseUrl: string
): FirebaseAdminListDeletionRepository =>
  new FirebaseAdminListDeletionRepository(getDatabaseWithUrl(databaseUrl, app))
