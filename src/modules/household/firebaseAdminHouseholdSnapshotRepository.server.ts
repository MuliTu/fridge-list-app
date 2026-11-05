import '@tanstack/react-start/server-only'

import type { App } from 'firebase-admin/app'
import { getDatabaseWithUrl } from 'firebase-admin/database'

import type { HouseholdSnapshotRepository } from './householdSnapshot.service'

export class FirebaseAdminHouseholdSnapshotRepository implements HouseholdSnapshotRepository {
  constructor(
    private readonly app: App,
    private readonly databaseUrl: string
  ) {}

  async get(listId: string): Promise<Record<string, unknown>> {
    const snapshot = await getDatabaseWithUrl(this.databaseUrl, this.app).ref(`users/${listId}`).get()
    const household = snapshot.val()
    return household && typeof household === 'object' ? household as Record<string, unknown> : {}
  }
}
