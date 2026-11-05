import type { ListAuthorizationRepository } from '../groceries'
import type { RequestContext } from '../shared'

export interface HouseholdSnapshotRepository {
  get(listId: string): Promise<Record<string, unknown>>
}

export class HouseholdSnapshotService {
  constructor(
    private readonly repository: HouseholdSnapshotRepository,
    private readonly authorization: ListAuthorizationRepository
  ) {}

  async get(context: RequestContext, listId: string): Promise<Record<string, unknown>> {
    await this.authorization.assertAccessible(context.principal, listId)
    return this.repository.get(listId)
  }
}
