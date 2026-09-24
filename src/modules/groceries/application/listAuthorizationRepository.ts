import type { AuthenticatedPrincipal } from '../../shared'

/**
 * The documented list-module authorization boundary. MM19 supplies the
 * membership-aware Firebase implementation; grocery commands only consume it.
 */
export type ListAuthorizationRepository = {
  assertAccessible(principal: AuthenticatedPrincipal, listId: string): Promise<void>
}
