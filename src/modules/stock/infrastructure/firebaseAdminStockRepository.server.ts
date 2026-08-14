import '@tanstack/react-start/server-only'

import type { App } from 'firebase-admin/app'
import { getDatabase, type Database } from 'firebase-admin/database'

import { ApplicationError } from '../../shared'
import type { NewStockRecord, StockPatch, StockRecord, StockRepository } from '../application/stockRepository'

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

export class FirebaseAdminStockRepository implements StockRepository {
  constructor(private readonly database: Database) {}

  async insert(listId: string, record: NewStockRecord): Promise<string> {
    try {
      const reference = this.database.ref(`users/${key(listId, 'listId')}/stock`).push()
      if (!reference.key) throw new ApplicationError('upstream_failed', 'Firebase did not allocate a stock key')
      await reference.set(record)
      return reference.key
    } catch (error) {
      return mapFailure('Firebase stock insert failed', error)
    }
  }

  async update(listId: string, stockId: string, patch: StockPatch): Promise<void> {
    try {
      await this.database.ref(`users/${key(listId, 'listId')}/stock/${key(stockId, 'stockId')}`).update(patch)
    } catch (error) {
      mapFailure('Firebase stock update failed', error)
    }
  }

  async delete(listId: string, stockId: string): Promise<void> {
    try {
      await this.database.ref(`users/${key(listId, 'listId')}/stock/${key(stockId, 'stockId')}`).remove()
    } catch (error) {
      mapFailure('Firebase stock delete failed', error)
    }
  }

  async list(listId: string): Promise<readonly StockRecord[]> {
    try {
      const snapshot = await this.database.ref(`users/${key(listId, 'listId')}/stock`).get()
      const value = snapshot.val() as Record<string, Omit<StockRecord, 'key'>> | null
      return Object.entries(value ?? {}).map(([recordKey, record]) => ({ key: recordKey, ...record }))
    } catch (error) {
      return mapFailure('Firebase stock read failed', error)
    }
  }
}

export const createFirebaseAdminStockRepository = (app: App): FirebaseAdminStockRepository =>
  new FirebaseAdminStockRepository(getDatabase(app))
