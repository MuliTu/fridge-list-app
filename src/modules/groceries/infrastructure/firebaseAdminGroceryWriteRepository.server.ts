import '@tanstack/react-start/server-only'

import { createHash } from 'node:crypto'
import { ApplicationError } from '../../shared'
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
