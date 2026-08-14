import {
  decideCreateTicketAccess,
  withCreateTicketAccess
} from './createTicketAccess.server'
import type { AuthCheckResult } from '../../../lib/verifyAuthToken'

// Authentication is injected in these unit tests, so no browser Request
// implementation is required from Jest's jsdom environment.
const request = {} as Request

const environment = (
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  AGENT_CREATE_TICKET_ENABLED: 'true',
  AGENT_CREATE_TICKET_ALLOWED_UIDS: 'user-1, user-2',
  ...overrides
})

const authenticator = (result: AuthCheckResult) => jest.fn(async () => result)

describe('create-ticket access control', () => {
  it.each([
    [
      'production',
      { NODE_ENV: 'production', AGENT_CREATE_TICKET_ENABLED: 'true' }
    ],
    ['a disabled environment', { AGENT_CREATE_TICKET_ENABLED: 'false' }],
    ['a missing enable flag', { AGENT_CREATE_TICKET_ENABLED: undefined }]
  ])('returns 404 in %s without authenticating', async (_name, overrides) => {
    const authenticate = authenticator({ ok: true, uid: 'user-1' })

    const decision = await decideCreateTicketAccess(request, {
      environment: environment(overrides as NodeJS.ProcessEnv),
      authenticate
    })

    expect(decision).toEqual({
      ok: false,
      status: 404,
      code: 'NOT_AVAILABLE',
      message: 'Create-ticket agent is not available'
    })
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('returns 401 when Firebase authentication fails', async () => {
    const decision = await decideCreateTicketAccess(request, {
      environment: environment(),
      authenticate: authenticator({ ok: false, reason: 'invalid token' })
    })

    expect(decision).toMatchObject({
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED'
    })
  })

  it('returns 403 for a verified UID absent from the normalized allowlist', async () => {
    const decision = await decideCreateTicketAccess(request, {
      environment: environment({
        AGENT_CREATE_TICKET_ALLOWED_UIDS: ' user-1, user-2 ,, '
      }),
      authenticate: authenticator({ ok: true, uid: 'user-3' })
    })

    expect(decision).toMatchObject({
      ok: false,
      status: 403,
      code: 'ACCESS_DENIED'
    })
  })

  it('allows each explicitly configured verified UID', async () => {
    for (const uid of ['user-1', 'user-2']) {
      await expect(
        decideCreateTicketAccess(request, {
          environment: environment(),
          authenticate: authenticator({ ok: true, uid })
        })
      ).resolves.toEqual({ ok: true, uid })
    }
  })

  it('allows dev-bypass only when that verified placeholder UID is explicit', async () => {
    const authenticate = authenticator({ ok: true, uid: 'dev-bypass' })

    await expect(
      decideCreateTicketAccess(request, {
        environment: environment(),
        authenticate
      })
    ).resolves.toMatchObject({ ok: false, status: 403 })

    await expect(
      decideCreateTicketAccess(request, {
        environment: environment({
          AGENT_CREATE_TICKET_ALLOWED_UIDS: 'user-1, dev-bypass'
        }),
        authenticate
      })
    ).resolves.toEqual({ ok: true, uid: 'dev-bypass' })
  })

  it.each([
    {
      name: 'unavailable',
      env: environment({ NODE_ENV: 'production' }),
      auth: { ok: true, uid: 'user-1' } as AuthCheckResult,
      status: 404
    },
    {
      name: 'unauthenticated',
      env: environment(),
      auth: { ok: false, reason: 'bad token' } as AuthCheckResult,
      status: 401
    },
    {
      name: 'not granted',
      env: environment(),
      auth: { ok: true, uid: 'user-3' } as AuthCheckResult,
      status: 403
    }
  ])('never invokes downstream work when $name', async ({ env, auth, status }) => {
    const downstream = jest.fn(async () => 'ticket-created')

    const result = await withCreateTicketAccess(request, downstream, {
      environment: env,
      authenticate: authenticator(auth)
    })

    expect(result).toMatchObject({ ok: false, status })
    expect(downstream).not.toHaveBeenCalled()
  })

  it('passes only the verified UID to downstream work after authorization', async () => {
    const downstream = jest.fn(async ({ uid }: { uid: string }) => ({
      ticket: 'created',
      uid
    }))

    await expect(
      withCreateTicketAccess(request, downstream, {
        environment: environment(),
        authenticate: authenticator({ ok: true, uid: 'user-1' })
      })
    ).resolves.toEqual({ ticket: 'created', uid: 'user-1' })
    expect(downstream).toHaveBeenCalledTimes(1)
  })
})
