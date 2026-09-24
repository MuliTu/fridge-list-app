import type { RequestContext } from '../../shared'
import type { ListAuthorizationRepository } from '../../lists'
import type { GroceryReadRecord, GroceryReadRepository } from './groceryReadRepository'

export class GetGroceriesService {
  constructor(
    private readonly repository: GroceryReadRepository,
    private readonly authorization: ListAuthorizationRepository
  ) {}

  async execute(context: RequestContext, listId: string): Promise<GroceryReadRecord[]> {
    await this.authorization.assertListReadable(context.principal, listId)
    return this.repository.list(listId)
  }
}
