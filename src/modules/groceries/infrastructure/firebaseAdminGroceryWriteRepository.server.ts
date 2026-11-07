import '@tanstack/react-start/server-only'

import { createHash } from 'node:crypto'
import { ApplicationError } from '../../shared'
import { DUPLICATE_SCAN_ALGORITHM_VERSION } from '../application/duplicateScan.service'
import { createFirebaseServiceAccountAccessTokenProvider } from './firebaseServiceAccountAccessTokenProvider.server'
import type {
  GroceryWriteRepository,
  GroceryPatch,
  NewGroceryRecord,
  ReactivateGroceryRecord
} from '../application/groceryWriteRepository'

type FirebaseDatabaseEnvironment = {
  FIREBASE_DATABASE_URL?: string
  FIREBASE_SERVICE_ACCOUNT_JSON?: string
}

export type AdminAccessTokenProvider = {
  getAccessToken(): Promise<{ access_token: string }>
}

type FetchImplementation = typeof fetch
type StoredGrocery = Partial<NewGroceryRecord> & { creationFingerprint?: unknown }
type StoredOperation = { fingerprint?: unknown; groceryKey?: unknown }
type StoredUser = {
  groceries?: Record<string, StoredGrocery | null> | null
  grocery_operations?: Record<string, StoredOperation | null> | null
  duplicate_scan_jobs?: Record<string, Record<string, unknown> | null> | null
  duplicate_scan_ready?: Record<string, Record<string, unknown> | null> | null
  [key: string]: unknown
}

const MAX_FIREBASE_SEGMENT_LENGTH = 200
const FORBIDDEN_FIREBASE_KEY_CHARACTERS = /[.#$/[\]\u0000-\u001f\u007f]/

const assertSafePathSegment = (value: string, field: string): void => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_FIREBASE_SEGMENT_LENGTH ||
    value.trim() !== value ||
    FORBIDDEN_FIREBASE_KEY_CHARACTERS.test(value)
  ) {
    throw new ApplicationError('invalid_input', `${field} is not a valid Firebase key`)
  }
}

const requireDatabaseUrl = (environment: FirebaseDatabaseEnvironment): string => {
  const value = environment.FIREBASE_DATABASE_URL?.trim()
  if (!value) {
    throw new ApplicationError('not_configured', 'FIREBASE_DATABASE_URL is required for server grocery writes')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new ApplicationError('not_configured', 'FIREBASE_DATABASE_URL must be a valid URL', error)
  }

  if (url.protocol !== 'https:' || url.username || url.password || (url.pathname !== '/' && url.pathname !== '')) {
    throw new ApplicationError('not_configured', 'FIREBASE_DATABASE_URL must be an HTTPS database root URL')
  }
  return url.toString().replace(/\/$/, '')
}

export class FirebaseAdminGroceryWriteRepository implements GroceryWriteRepository {
  constructor(
    private readonly databaseUrl: string,
    private readonly credential: AdminAccessTokenProvider,
    private readonly fetchImplementation: FetchImplementation = fetch
  ) {}

  private async request(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown): Promise<Response> {
    let accessToken: string
    try {
      const result = await this.credential.getAccessToken()
      accessToken = result.access_token
    } catch (error) {
      throw new ApplicationError('unavailable', 'Firebase Admin credential could not issue an access token', error)
    }

    if (!accessToken) {
      throw new ApplicationError('unavailable', 'Firebase Admin credential returned an empty access token')
    }

    let response: Response
    try {
      response = await this.fetchImplementation(`${this.databaseUrl}/${path}.json`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    } catch (error) {
      throw new ApplicationError('upstream_failed', 'Firebase Realtime Database request failed', error)
    }

    if (!response.ok) {
      throw new ApplicationError('upstream_failed', `Firebase Realtime Database returned HTTP ${response.status}`)
    }
    return response
  }

  async insert(listId: string, record: NewGroceryRecord): Promise<string> {
    assertSafePathSegment(listId, 'listId')
    const response = await this.request(`users/${listId}/groceries`, 'POST', {
      item: record.item,
      category: record.category,
      added_at: record.added_at,
      raw_text: record.raw_text,
      bought: record.bought,
      created_by: record.created_by,
      ...(record.list_name === undefined ? {} : { list_name: record.list_name }),
      ...(record.quantity === undefined ? {} : { quantity: record.quantity }),
      ...(record.unit === undefined ? {} : { unit: record.unit }),
      ...(record.modified_at === undefined ? {} : { modified_at: record.modified_at }),
      ...(record.modified_by === undefined ? {} : { modified_by: record.modified_by })
    })

    let result: unknown
    try {
      result = await response.json()
    } catch (error) {
      throw new ApplicationError('upstream_failed', 'Firebase returned an invalid insert response', error)
    }
    const key =
      result && typeof result === 'object' && typeof (result as { name?: unknown }).name === 'string'
        ? (result as { name: string }).name
        : null
    if (!key) {
      throw new ApplicationError('upstream_failed', 'Firebase did not return a grocery item key')
    }
    return key
  }

  async insertActiveUnique(
    listId: string,
    normalizedName: string,
    operation: string | null,
    record: NewGroceryRecord
  ): Promise<string> {
    assertSafePathSegment(listId, 'listId')
    if (!normalizedName || normalizedName !== normalizedName.trim() || normalizedName.length > MAX_FIREBASE_SEGMENT_LENGTH) {
      throw new ApplicationError('invalid_input', 'normalizedName is invalid')
    }
    if (operation !== null && (!operation.trim() || operation.length > 500)) {
      throw new ApplicationError('invalid_input', 'idempotencyKey is invalid')
    }

    const { added_at: _created, modified_at: _modified, ...intent } = record
    const fingerprint = createHash('sha256').update(JSON.stringify(intent)).digest('hex')
    const operationId = operation === null ? null : `manual_${createHash('sha256').update(operation).digest('hex')}`
    const baseId = `active_${createHash('sha256').update(normalizedName).digest('hex')}`

    // Registration is stable list metadata. It must succeed before the
    // list-local grocery/outbox transaction so every committed job is
    // discoverable without a database-root transaction.
    await this.request(`duplicate_scan_lists/${listId}`, 'PUT', {
      listId
    })

    for (let attempt = 0; attempt < 25; attempt += 1) {
      let accessToken: string
      try {
        accessToken = (await this.credential.getAccessToken()).access_token
      } catch (error) {
        throw new ApplicationError('unavailable', 'Firebase Admin credential could not issue an access token', error)
      }
      if (!accessToken) throw new ApplicationError('unavailable', 'Firebase Admin credential returned an empty access token')

      let response: Response
      try {
        response = await this.fetchImplementation(`${this.databaseUrl}/users/${listId}.json`, {
          headers: { Authorization: `Bearer ${accessToken}`, 'X-Firebase-ETag': 'true' }
        })
      } catch (error) {
        throw new ApplicationError('upstream_failed', 'Firebase Realtime Database request failed', error)
      }
      if (!response.ok) throw new ApplicationError('upstream_failed', `Firebase Realtime Database returned HTTP ${response.status}`)
      const etag = response.headers.get('etag')
      if (!etag) throw new ApplicationError('upstream_failed', 'Firebase transaction response omitted an ETag')

      let user: StoredUser
      try {
        const value: unknown = await response.json()
        user = value && typeof value === 'object' && !Array.isArray(value) ? value as StoredUser : {}
      } catch (error) {
        throw new ApplicationError('upstream_failed', 'Firebase returned an invalid database record', error)
      }
      const groceries = user.groceries && typeof user.groceries === 'object' ? user.groceries : {}
      const operations = user.grocery_operations && typeof user.grocery_operations === 'object'
        ? user.grocery_operations
        : {}

      if (operationId) {
        const legacy = groceries[operationId]
        if (legacy) {
          if (legacy.creationFingerprint !== fingerprint) {
            throw new ApplicationError('conflict', 'Operation was already used for different grocery data')
          }
          return operationId
        }
        const replay = operations[operationId]
        if (replay) {
          if (replay.fingerprint !== fingerprint || typeof replay.groceryKey !== 'string') {
            throw new ApplicationError('conflict', 'Operation was already used for different grocery data')
          }
          return replay.groceryKey
        }
      }

      const existing = Object.entries(groceries).find(([, grocery]) =>
        grocery && grocery.bought === false && typeof grocery.item === 'string' &&
        grocery.item.trim().normalize('NFKC').toLocaleLowerCase() === normalizedName
      )
      if (existing && !operationId) return existing[0]

      let selectedId = existing?.[0] ?? operationId ?? baseId
      if (!existing) {
        let suffix = 0
        while (Object.prototype.hasOwnProperty.call(groceries, selectedId)) {
          suffix += 1
          selectedId = `${operationId ?? baseId}_${suffix}`
        }
      }
      const nextUser: StoredUser = {
        ...user,
        groceries: existing ? groceries : {
          ...groceries,
          [selectedId]: operationId ? { ...record, creationFingerprint: fingerprint } : record
        },
        grocery_operations: operationId ? {
          ...operations,
          [operationId]: { fingerprint, groceryKey: selectedId }
        } : operations,
        duplicate_scan_jobs: existing ? user.duplicate_scan_jobs : {
          ...(user.duplicate_scan_jobs && typeof user.duplicate_scan_jobs === 'object' ? user.duplicate_scan_jobs : {}),
          [selectedId]: {
            itemId: selectedId,
            status: 'pending',
            attempts: 0,
            algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION,
            createdAt: record.added_at,
            updatedAt: record.added_at
          }
        },
        duplicate_scan_ready: existing ? user.duplicate_scan_ready : {
          ...(user.duplicate_scan_ready && typeof user.duplicate_scan_ready === 'object'
            ? user.duplicate_scan_ready
            : {}),
          [selectedId]: {
            itemId: selectedId,
            algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION,
            createdAt: record.added_at
          }
        }
      }
      try {
        response = await this.putUserIfMatch(accessToken, etag, listId, nextUser)
      } catch (error) {
        throw new ApplicationError('upstream_failed', 'Firebase Realtime Database request failed', error)
      }
      if (response.status === 412) continue
      if (!response.ok) throw new ApplicationError('upstream_failed', `Firebase Realtime Database returned HTTP ${response.status}`)
      return selectedId
    }
    throw new ApplicationError('upstream_failed', 'Firebase grocery transaction did not converge')
  }

  private putUserIfMatch(accessToken: string, etag: string, listId: string, user: StoredUser): Promise<Response> {
    return this.fetchImplementation(`${this.databaseUrl}/users/${listId}.json`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'If-Match': etag
      },
      body: JSON.stringify(user)
    })
  }

  async insertIdempotent(listId: string, idempotencyKey: string, record: NewGroceryRecord): Promise<string> {
    assertSafePathSegment(listId, 'listId')
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 500) {
      throw new ApplicationError('invalid_input', 'idempotencyKey is invalid')
    }
    const key = `integration_${createHash('sha256').update(idempotencyKey, 'utf8').digest('hex').slice(0, 40)}`
    await this.request(`users/${listId}/groceries/${key}`, 'PUT', {
      item: record.item,
      category: record.category,
      added_at: record.added_at,
      raw_text: record.raw_text,
      bought: record.bought,
      created_by: record.created_by,
      ...(record.list_name === undefined ? {} : { list_name: record.list_name }),
      ...(record.quantity === undefined ? {} : { quantity: record.quantity }),
      ...(record.unit === undefined ? {} : { unit: record.unit }),
      ...(record.modified_at === undefined ? {} : { modified_at: record.modified_at }),
      ...(record.modified_by === undefined ? {} : { modified_by: record.modified_by })
    })
    return key
  }

  async reactivate(listId: string, itemKey: string, record: ReactivateGroceryRecord): Promise<void> {
    assertSafePathSegment(listId, 'listId')
    assertSafePathSegment(itemKey, 'itemKey')
    await this.request(`users/${listId}/groceries/${itemKey}`, 'PATCH', {
      bought: false,
      added_at: record.added_at
    })
  }


  async update(listId: string, itemKey: string, patch: GroceryPatch): Promise<void> {
    assertSafePathSegment(listId, 'listId')
    assertSafePathSegment(itemKey, 'itemKey')
    await this.request(`users/${listId}/groceries/${itemKey}`, 'PATCH', patch)
  }

  async delete(listId: string, itemKey: string): Promise<void> {
    assertSafePathSegment(listId, 'listId')
    assertSafePathSegment(itemKey, 'itemKey')
    await this.request(`users/${listId}/groceries/${itemKey}`, 'DELETE')
  }
}

export const createFirebaseAdminGroceryWriteRepository = (
  environment: FirebaseDatabaseEnvironment
): FirebaseAdminGroceryWriteRepository => {
  const databaseUrl = requireDatabaseUrl(environment)
  const credential = createFirebaseServiceAccountAccessTokenProvider(environment.FIREBASE_SERVICE_ACCOUNT_JSON)
  return new FirebaseAdminGroceryWriteRepository(databaseUrl, credential)
}
