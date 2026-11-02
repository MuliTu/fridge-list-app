import type { App } from 'firebase-admin/app'
import { getDatabaseWithUrl } from 'firebase-admin/database'

import type { ListAuthorizationRepository } from '../groceries'
import type { RequestContext } from '../shared'

export class HouseholdSnapshotService {
  constructor(
    private readonly app: App,
    private readonly databaseUrl: string,
    private readonly authorization: ListAuthorizationRepository
  ) {}

  async get(context: RequestContext, listId: string): Promise<Record<string, unknown>> {
    await this.authorization.assertAccessible(context.principal, listId)
    const snapshot = await getDatabaseWithUrl(this.databaseUrl, this.app).ref(`users/${listId}`).get()
    const household = snapshot.val()
    return household && typeof household === 'object' ? household as Record<string, unknown> : {}
  }
}
