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
    collapsed: record.collapsed === true || record.section_collapsed === true
  }
}

export class FirebaseAdminSemanticGroceryRepository implements SemanticGroceryCandidateRepository {
  constructor(private readonly database: Database) {}

  async listCandidates(listId: string): Promise<SemanticGroceryCandidate[]> {
    try {
      const snapshot = await this.database.ref(`users/${safeKey(listId, 'listId')}/groceries`).get()
      const value = snapshot.val()
      if (!value || typeof value !== 'object') return []
      return Object.entries(value as Record<string, unknown>)
        .map(([id, record]) => candidateFrom(id, record))
        .filter((candidate): candidate is SemanticGroceryCandidate => candidate !== null)
    } catch (error) {
      if (error instanceof ApplicationError) throw error
      throw new ApplicationError('upstream_failed', 'Firebase grocery candidate read failed', error)
    }
  }
}

export const createFirebaseAdminSemanticGroceryRepository = (
  app: App,
  databaseUrl: string
): FirebaseAdminSemanticGroceryRepository =>
  new FirebaseAdminSemanticGroceryRepository(getDatabaseWithUrl(databaseUrl, app))
