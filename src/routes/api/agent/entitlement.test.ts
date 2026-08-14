/**
 * @jest-environment node
 */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

const verifyAuthTokenMock = jest.fn()
jest.mock('../../../lib/verifyAuthToken', () => ({
  verifyAuthToken: (...args: unknown[]) => verifyAuthTokenMock(...args)
}))

import { Route } from './entitlement'

const getHandler = (Route.options.server as any).handlers.GET

const callGet = () =>
  getHandler({
    request: new Request('http://localhost/api/agent/entitlement', {
      headers: { authorization: 'Bearer token' }
    })
  }) as Promise<Response>

describe('GET /api/agent/entitlement', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalEnabled = process.env.AGENT_CREATE_TICKET_ENABLED
  const originalAllowedUids = process.env.AGENT_CREATE_TICKET_ALLOWED_UIDS

  beforeEach(() => {
    verifyAuthTokenMock.mockReset()
    process.env.NODE_ENV = 'test'
    process.env.AGENT_CREATE_TICKET_ENABLED = 'true'
    process.env.AGENT_CREATE_TICKET_ALLOWED_UIDS = 'user-1, user-2'
  })

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv
    if (originalEnabled === undefined) {
      delete process.env.AGENT_CREATE_TICKET_ENABLED
    } else {
      process.env.AGENT_CREATE_TICKET_ENABLED = originalEnabled
    }
    if (originalAllowedUids === undefined) {
      delete process.env.AGENT_CREATE_TICKET_ALLOWED_UIDS
    } else {
      process.env.AGENT_CREATE_TICKET_ALLOWED_UIDS = originalAllowedUids
    }
  })

  it.each([
    ['production', 'production', 'true'],
    ['disabled environments', 'test', 'false']
  ])('conceals the endpoint with 404 in %s', async (_name, nodeEnv, enabled) => {
    process.env.NODE_ENV = nodeEnv
    process.env.AGENT_CREATE_TICKET_ENABLED = enabled

    const response = await callGet()

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: {
        code: 'NOT_AVAILABLE',
        message: 'Create-ticket agent is not available'
      }
    })
    expect(verifyAuthTokenMock).not.toHaveBeenCalled()
  })

  it('returns a safe 401 for missing or invalid Firebase authentication', async () => {
    verifyAuthTokenMock.mockResolvedValue({
      ok: false,
      reason: 'raw verifier details must stay private'
    })

    const response = await callGet()

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication is required'
      }
    })
  })

  it('returns only entitled false for an authenticated non-granted user', async () => {
    verifyAuthTokenMock.mockResolvedValue({ ok: true, uid: 'not-allowed' })

    const response = await callGet()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ entitled: false })
    expect(JSON.stringify(body)).not.toContain('not-allowed')
    expect(JSON.stringify(body)).not.toContain('user-1')
  })

  it('returns only entitled true for a granted authenticated user', async () => {
    verifyAuthTokenMock.mockResolvedValue({ ok: true, uid: 'user-2' })

    const response = await callGet()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ entitled: true })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('requires dev-bypass to be explicitly allowlisted', async () => {
    verifyAuthTokenMock.mockResolvedValue({ ok: true, uid: 'dev-bypass' })

    const denied = await callGet()
    expect(await denied.json()).toEqual({ entitled: false })

    process.env.AGENT_CREATE_TICKET_ALLOWED_UIDS = 'user-1, dev-bypass'
    const granted = await callGet()
    expect(await granted.json()).toEqual({ entitled: true })
  })
})
