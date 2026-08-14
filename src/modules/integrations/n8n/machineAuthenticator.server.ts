import '@tanstack/react-start/server-only'

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'

import { ApplicationError, type RequestContext, type ServicePrincipal } from '../../shared'

export const N8N_SECRET_HEADER = 'x-n8n-secret'
export const N8N_GROCERIES_WRITE_SCOPE = 'groceries:write'
export const REQUEST_ID_HEADER = 'x-request-id'

export type N8nServicePrincipal = ServicePrincipal & {
  service: 'n8n'
  scopes: readonly [typeof N8N_GROCERIES_WRITE_SCOPE]
  allowedListIds: ReadonlySet<string>
}

export type N8nMachineAuthenticationConfig = {
  sharedSecret: string | undefined
  allowedListId: string | undefined
}

type HeaderReader = Pick<Headers, 'get'>

export type N8nRequestContext = Omit<RequestContext, 'principal'> & {
  principal: N8nServicePrincipal
}

const hasConfiguredValue = (value: string | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0

const digestSecret = (secret: string): Buffer => createHash('sha256').update(secret, 'utf8').digest()

const normalizeRequestId = (value: string | null): string | null => {
  const candidate = value?.trim()
  return candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : null
}

/**
 * Authenticates the legacy n8n shared-secret header without inspecting the
 * request URL or body. This boundary can later be replaced by an HMAC-based
 * authenticator without changing the service-principal contract.
 */
export class N8nMachineAuthenticator {
  constructor(
    private readonly config: N8nMachineAuthenticationConfig,
    private readonly generateRequestId: () => string = randomUUID
  ) {}

  authenticate(headers: HeaderReader): N8nServicePrincipal {
    const { sharedSecret, allowedListId } = this.config
    if (!hasConfiguredValue(sharedSecret) || !hasConfiguredValue(allowedListId)) {
      throw new ApplicationError('not_configured', 'Machine authentication is not configured')
    }

    const presentedSecret = headers.get(N8N_SECRET_HEADER) ?? ''
    const expectedDigest = digestSecret(sharedSecret)
    const presentedDigest = digestSecret(presentedSecret)

    if (!timingSafeEqual(expectedDigest, presentedDigest)) {
      throw new ApplicationError('unauthenticated', 'Invalid machine credentials')
    }

    return {
      kind: 'service',
      service: 'n8n',
      scopes: Object.freeze([N8N_GROCERIES_WRITE_SCOPE]),
      allowedListIds: new Set([allowedListId.trim()])
    }
  }

  authenticateRequest(headers: HeaderReader, now: Date = new Date()): N8nRequestContext {
    const principal = this.authenticate(headers)
    return {
      principal,
      requestId: normalizeRequestId(headers.get(REQUEST_ID_HEADER)) ?? this.generateRequestId(),
      now
    }
  }
}

export type N8nMachineAuthenticationEnvironment = {
  N8N_WRITE_SECRET?: string
  N8N_ALLOWED_LIST_ID?: string
}

export const createN8nMachineAuthenticator = (
  environment: N8nMachineAuthenticationEnvironment
): N8nMachineAuthenticator =>
  new N8nMachineAuthenticator({
    sharedSecret: environment.N8N_WRITE_SECRET,
    allowedListId: environment.N8N_ALLOWED_LIST_ID
  })
