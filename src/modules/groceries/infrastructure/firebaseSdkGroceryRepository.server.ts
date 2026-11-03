import '@tanstack/react-start/server-only'

import { createHash } from 'node:crypto'
import { getDatabaseWithUrl, type Database } from 'firebase-admin/database'
import type { App } from 'firebase-admin/app'
import { ApplicationError } from '../../shared'
import type { GroceryRepository, GroceryPatch, NewGroceryRecord, ReactivateGroceryRecord } from '../application/groceryWriteRepository'

const segment = (value: string): string => {
  if (!value || value.length > 200 || value.trim() !== value || /[.#$/[\]\u0000-\u001f\u007f]/.test(value)) {
    throw new ApplicationError('invalid_input', 'Invalid Firebase key')
  }
  return value
}

// The browser-command adapter uses the same Admin app as token verification.
// Machine integrations retain their separately configured REST adapter.
export class FirebaseSdkGroceryRepository implements GroceryRepository {
  constructor(private readonly database: Database) {}

  private reference(listId: string, itemId?: string) {
    return this.database.ref(`users/${segment(listId)}/groceries${itemId !== undefined ? `/${segment(itemId)}` : ''}`)
  }

  private async persist<T>(action: () => Promise<T>): Promise<T> {
    try { return await action() } catch (error) {
      if (error instanceof ApplicationError) throw error
      throw new ApplicationError('upstream_failed', 'Grocery persistence failed', error)
    }
  }

  async insert(listId: string, record: NewGroceryRecord): Promise<string> {
    return this.persist(async () => {
      const ref = this.reference(listId).push()
      if (!ref.key) throw new ApplicationError('upstream_failed', 'No grocery key allocated')
      await ref.set(record)
      return ref.key
    })
  }

  async insertIdempotent(listId: string, operation: string, record: NewGroceryRecord): Promise<string> {
    return this.persist(async () => {
      const id = `manual_${createHash('sha256').update(operation).digest('hex')}`
      // Server timestamps differ across retries and are not part of user intent.
      const { added_at: _created, modified_at: _modified, ...intent } = record
      const fingerprint = createHash('sha256').update(JSON.stringify(intent)).digest('hex')
      const result = await this.reference(listId, id).transaction((current) => {
        if (current === null) return { ...record, creationFingerprint: fingerprint }
        return current.creationFingerprint === fingerprint ? current : undefined
      })
      if (!result.committed) throw new ApplicationError('conflict', 'Operation was already used for different grocery data')
      return id
    })
  }

  async update(listId: string, itemId: string, patch: GroceryPatch): Promise<void> {
    await this.persist(async () => {
      const result = await this.reference(listId, itemId).transaction((current) => {
        // Returning null lets the SDK resolve an initially empty local cache.
        if (current === null) return null
        const next = { ...current, ...patch }
        for (const field of Object.keys(next)) if (next[field] === null) delete next[field]
        return next
      })
      if (!result.snapshot.exists()) throw new ApplicationError('not_found', 'Grocery item no longer exists')
    })
  }

  async reactivate(listId: string, itemId: string, record: ReactivateGroceryRecord): Promise<void> {
    await this.update(listId, itemId, record)
  }

  async delete(listId: string, itemId: string): Promise<void> {
    await this.persist(() => this.reference(listId, itemId).remove())
  }
}

export const createFirebaseSdkGroceryRepository = (app: App, url: string): GroceryRepository =>
  new FirebaseSdkGroceryRepository(getDatabaseWithUrl(url, app))
