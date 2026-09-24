import type { AuthenticatedPrincipal } from '../../shared'

/**
 * Catalog commands share the list-access contract used by other list modules,
 * while destructive category changes require the stronger owner capability.
 */
export type CatalogAuthorizationRepository = {
  assertAccessible(principal: AuthenticatedPrincipal, listId: string): Promise<void>
  assertOwner(principal: AuthenticatedPrincipal, listId: string): Promise<void>
}
