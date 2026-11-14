import '@tanstack/react-start/server-only'

import type { App } from 'firebase-admin/app'
import { getDatabaseWithUrl, type Database } from 'firebase-admin/database'

import { ApplicationError } from '../../shared'
import type {
  SemanticGroceryCandidateRepository
} from '../application/semanticGroceryMatch.service'
import type { SemanticGroceryCandidate } from '../domain/semanticGroceryMatch'

const invalidKey = /[.#$/[\]\u0000-\u001f\u007f]/

const safeKey = (value: string, field: string): string => {
  if (!value || value.length > 200 || value.trim() !== value || invalidKey.test(value)) {
    throw new ApplicationError('invalid_input', `${field} is not a valid Firebase key`)
  }
  return value
}

const candidateFrom = (id: string, value: unknown): SemanticGroceryCandidate | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.item !== 'string' || !record.item.trim()) return null
  return {
    id: safeKey(id, 'itemId'),
    name: record.item.trim(),
    category: typeof record.category === 'string' ? record.category : '',
    bought: record.bought === true,
    hidden: record.hidden === true,
    collapsed: record.collapsed === true || record.section_collapsed === true,
    ...(typeof record.quantity === 'number' && Number.isFinite(record.quantity) && { quantity: record.quantity }),
    ...(typeof record.unit === 'string' && { unit: record.unit.slice(0, 40) }),
    ...(typeof record.note === 'string' && { notes: record.note.slice(0, 2_000) })
  }
}

export class FirebaseAdminSemanticGroceryRepository implements SemanticGroceryCandidateRepository {
  constructor(private readonly database: Database) {}

  async listCandidates(listId: string, listName: string | null = null): Promise<SemanticGroceryCandidate[]> {
    try {
      const snapshot = await this.database.ref(`users/${safeKey(listId, 'listId')}/groceries`).get()
      const value = snapshot.val()
      if (!value || typeof value !== 'object') return []
      return Object.entries(value as Record<string, unknown>)
        .filter(([, record]) => {
          if (record === null || typeof record !== 'object') return false
          const storedName = (record as Record<string, unknown>).list_name
          return (storedName == null || storedName === '' ? null : storedName) === listName
        })
        .map(([id, record]) => candidateFrom(id, record))
        .filter((candidate): candidate is SemanticGroceryCandidate => candidate !== null)
    } catch (error) {
      if (error instanceof ApplicationError) throw error
      throw new ApplicationError('upstream_failed', 'Firebase grocery candidate read failed', error)
    }
  }
  async listAllowedCategories(listId: string): Promise<string[]> {
    const snapshot = await this.database.ref(`users/${safeKey(listId, 'listId')}/categories`).limitToFirst(101).get()
    if (snapshot.numChildren() > 100) return []
    const names = new Set<string>()
    snapshot.forEach((child) => {
      const name: unknown = child.val()?.name
      if (typeof name === 'string' && name.length > 0 && name.length <= 100 && name.trim() === name) {
        names.add(name)
      }
    })
    return [...names]
  }
}

export const createFirebaseAdminSemanticGroceryRepository = (
  app: App,
  databaseUrl: string
): FirebaseAdminSemanticGroceryRepository =>
  new FirebaseAdminSemanticGroceryRepository(getDatabaseWithUrl(databaseUrl, app))
