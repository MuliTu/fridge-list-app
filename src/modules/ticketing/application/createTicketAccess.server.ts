import type { AuthCheckResult } from '../../../lib/verifyAuthToken'

export type CreateTicketAccessRejection = {
  ok: false
  status: 401 | 403 | 404
  code: 'UNAUTHORIZED' | 'ACCESS_DENIED' | 'NOT_AVAILABLE'
  message: string
}

export type CreateTicketAccessDecision =
  | { ok: true; uid: string }
  | CreateTicketAccessRejection

export interface CreateTicketAccessOptions {
  environment: NodeJS.ProcessEnv
  authenticate: (request: Request) => Promise<AuthCheckResult>
}

const NOT_AVAILABLE: CreateTicketAccessRejection = {
  ok: false,
  status: 404,
  code: 'NOT_AVAILABLE',
  message: 'Create-ticket agent is not available'
}

const UNAUTHORIZED: CreateTicketAccessRejection = {
  ok: false,
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication is required'
}

const ACCESS_DENIED: CreateTicketAccessRejection = {
  ok: false,
  status: 403,
  code: 'ACCESS_DENIED',
  message: 'Access is denied'
}

const parseAllowedUids = (value: string | undefined): ReadonlySet<string> =>
  new Set(
    (value ?? '')
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean)
  )

/**
 * Applies the create-ticket route's access checks in the required order.
 *
 * Availability is checked before authentication so production and disabled
 * deployments consistently conceal the experimental endpoint with a 404.
 * Authorization uses only the UID returned by Firebase verification.
 */
export const decideCreateTicketAccess = async (
  request: Request,
  options: CreateTicketAccessOptions
): Promise<CreateTicketAccessDecision> => {
  const { environment } = options

  if (
    environment.NODE_ENV === 'production' ||
    environment.AGENT_CREATE_TICKET_ENABLED !== 'true'
  ) {
    return NOT_AVAILABLE
  }

  const authResult = await options.authenticate(request)
  if (!authResult.ok) return UNAUTHORIZED

  const allowedUids = parseAllowedUids(
    environment.AGENT_CREATE_TICKET_ALLOWED_UIDS
  )
  if (!allowedUids.has(authResult.uid)) return ACCESS_DENIED

  return { ok: true, uid: authResult.uid }
}

/**
 * Convenience boundary for routes: downstream work is invoked only after all
 * access checks pass, making rejection-before-side-effects easy to preserve.
 */
export const withCreateTicketAccess = async <T>(
  request: Request,
  downstream: (access: { uid: string }) => Promise<T>,
  options: CreateTicketAccessOptions
): Promise<T | CreateTicketAccessRejection> => {
  const decision = await decideCreateTicketAccess(request, options)
  if (!decision.ok) return decision

  return downstream({ uid: decision.uid })
}
