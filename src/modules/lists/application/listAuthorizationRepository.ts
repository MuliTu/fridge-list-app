import type { AuthenticatedPrincipal } from '../../shared'

export interface ListAuthorizationRepository {
  assertListReadable(principal: AuthenticatedPrincipal, listId: string): Promise<void>
  assertListWritable(principal: AuthenticatedPrincipal, listId: string): Promise<void>
  assertListOwner(principal: AuthenticatedPrincipal, listId: string): Promise<void>
  assertOwnIdentity(principal: AuthenticatedPrincipal, uid: string): Promise<void>
}
