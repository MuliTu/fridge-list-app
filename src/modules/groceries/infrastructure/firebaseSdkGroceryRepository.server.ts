import '@tanstack/react-start/server-only'

import { createHash } from 'node:crypto'
import { getDatabaseWithUrl, type Database } from 'firebase-admin/database'
import type { App } from 'firebase-admin/app'
import { ApplicationError } from '../../shared'
import { DUPLICATE_SCAN_ALGORITHM_VERSION } from '../application/duplicateScan.service'
import type { GroceryRepository, GroceryPatch, NewGroceryRecord, ReactivateGroceryRecord } from '../application/groceryWriteRepository'

type StoredGrocery = Partial<NewGroceryRecord> & { creationFingerprint?: unknown }
type StoredOperation = { fingerprint?: unknown; groceryKey?: unknown }
type StoredList = {
  groceries?: Record<string, StoredGrocery | null> | null
  grocery_operations?: Record<string, StoredOperation | null> | null
  duplicate_scan_jobs?: Record<string, Record<string, unknown> | null> | null
  duplicate_scan_ready?: Record<string, Record<string, unknown> | null> | null
  [key: string]: unknown
}

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

  private listReference(listId: string) {
    return this.database.ref(`users/${segment(listId)}`)
  }

  private registryReference(listId: string) {
    return this.database.ref(`duplicate_scan_lists/${segment(listId)}`)
  }

  private async ensureRegistered(listId: string): Promise<void> {
    const result = await this.registryReference(listId).transaction((current) => current ?? {
      listId
    })
    if (!result.committed) {
      throw new ApplicationError('upstream_failed', 'Duplicate scan list registration did not commit')
    }
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

  async insertActiveUnique(
    listId: string,
    normalizedName: string,
    operation: string | null,
    record: NewGroceryRecord
  ): Promise<string> {
    if (!normalizedName || normalizedName !== normalizedName.trim() || normalizedName.length > 200) {
      throw new ApplicationError('invalid_input', 'Invalid normalized grocery name')
    }
    if (operation !== null && (!operation.trim() || operation.length > 500)) {
      throw new ApplicationError('invalid_input', 'idempotencyKey is invalid')
    }

    return this.persist(async () => {
      const { added_at: _created, modified_at: _modified, ...intent } = record
      const fingerprint = createHash('sha256').update(JSON.stringify(intent)).digest('hex')
      const operationId = operation === null ? null : `manual_${createHash('sha256').update(operation).digest('hex')}`
      const baseId = `active_${createHash('sha256').update(normalizedName).digest('hex')}`
      let selectedId: string | undefined
      let operationConflict = false
      let created = false

      // Registration is stable list metadata, not per-job state. Establishing it
      // before the list-local transaction makes every committed outbox job
      // discoverable without a cross-root transaction.
      await this.ensureRegistered(listId)
      const result = await this.listReference(listId).transaction((current: StoredList | null) => {
        selectedId = undefined
        operationConflict = false
        created = false
        const list = current && typeof current === 'object' ? current : {}
        const groceries = list.groceries && typeof list.groceries === 'object' ? list.groceries : {}
        const operations = list.grocery_operations && typeof list.grocery_operations === 'object'
          ? list.grocery_operations
          : {}

        if (operationId) {
          const legacy = groceries[operationId]
          if (legacy) {
            if (legacy.creationFingerprint !== fingerprint) {
              operationConflict = true
              return undefined
            }
            selectedId = operationId
            return list
          }
          const replay = operations[operationId]
          if (replay) {
            if (replay.fingerprint !== fingerprint || typeof replay.groceryKey !== 'string') {
              operationConflict = true
              return undefined
            }
            selectedId = replay.groceryKey
            return list
          }
        }

        const existing = Object.entries(groceries).find(([, grocery]) =>
          grocery && grocery.bought === false && typeof grocery.item === 'string' &&
          grocery.item.trim().normalize('NFKC').toLocaleLowerCase() === normalizedName
        )
        if (existing) selectedId = existing[0]
        else {
          let candidate = operationId ?? baseId
          let suffix = 0
          while (Object.prototype.hasOwnProperty.call(groceries, candidate)) {
            suffix += 1
            candidate = `${operationId ?? baseId}_${suffix}`
          }
          selectedId = candidate
          created = true
        }

        const nextGroceries = existing ? groceries : {
          ...groceries,
          [selectedId]: operationId ? { ...record, creationFingerprint: fingerprint } : record
        }
        const nextOperations = operationId ? {
          ...operations,
          [operationId]: { fingerprint, groceryKey: selectedId }
        } : operations
        const jobs = list.duplicate_scan_jobs && typeof list.duplicate_scan_jobs === 'object'
          ? list.duplicate_scan_jobs
          : {}
        const nextJobs = created && selectedId && !jobs[selectedId] ? {
          ...jobs,
          [selectedId]: {
            itemId: selectedId,
            status: 'pending',
            attempts: 0,
            algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION,
            createdAt: record.added_at,
            updatedAt: record.added_at
          }
        } : jobs
        const ready = list.duplicate_scan_ready && typeof list.duplicate_scan_ready === 'object'
          ? list.duplicate_scan_ready
          : {}
        return {
          ...list,
          groceries: nextGroceries,
          grocery_operations: nextOperations,
          duplicate_scan_jobs: nextJobs,
          duplicate_scan_ready: created && selectedId ? {
            ...ready,
            [selectedId]: {
              itemId: selectedId,
              algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION,
              createdAt: record.added_at
            }
          } : ready
        }
      })

      if (!result.committed || !selectedId) {
        if (operationConflict) {
          throw new ApplicationError('conflict', 'Operation was already used for different grocery data')
        }
        throw new ApplicationError('upstream_failed', 'Atomic grocery insert did not commit')
      }
      return selectedId
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
