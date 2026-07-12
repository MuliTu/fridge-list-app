/**
 * Auth-token verification unit tests. 'jose' is faked module-wide via
 * jest.config.cjs's moduleNameMapper (see src/test/mocks/joseMock.ts for why —
 * jose v6 is pure ESM with no CJS build, which Jest can't load directly). The fake
 * `jwtVerify` decodes a lightweight base64url-JSON "fake JWT" built by `signFakeToken`
 * below and re-implements jose's issuer/audience/requiredClaims/exp checks, so these
 * tests exercise this app's own verification logic (header parsing, claim-mismatch →
 * `{ ok: false }` mapping, dev-bypass gating) without touching real network/crypto.
 */
import { verifyAuthToken, verifyIdTokenClaims, isDevBypassActive, FIREBASE_PROJECT_ID } from './verifyAuthToken'

const ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
const FAKE_JWKS = 'unused-in-tests' as any

// jest-environment-jsdom doesn't implement the Fetch API's real `Request` class, and
// verifyAuthToken() only ever touches `request.headers.get('authorization')`, so a
// minimal fake covering just that surface avoids needing a Request/fetch polyfill.
const fakeRequest = (authHeader?: string) =>
  ({ headers: { get: (name: string) => (name.toLowerCase() === 'authorization' ? (authHeader ?? null) : null) } }) as unknown as Request

const signFakeToken = (overrides: Record<string, unknown> = {}) => {
  const claims = {
    iss: ISSUER,
    aud: FIREBASE_PROJECT_ID,
    sub: 'user-123',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides
  }
  return Buffer.from(JSON.stringify(claims)).toString('base64url')
}

describe('verifyIdTokenClaims', () => {
  it('accepts a token with the right issuer/audience/subject and a future exp', async () => {
    const token = signFakeToken()
    const result = await verifyIdTokenClaims(token, FAKE_JWKS)
    expect(result).toEqual({ ok: true, uid: 'user-123' })
  })

  it('rejects an expired token', async () => {
    const token = signFakeToken({ exp: Math.floor(Date.now() / 1000) - 3600 })
    const result = await verifyIdTokenClaims(token, FAKE_JWKS)
    expect(result.ok).toBe(false)
  })

  it('rejects a token with the wrong issuer', async () => {
    const token = signFakeToken({ iss: 'https://securetoken.google.com/some-other-project' })
    const result = await verifyIdTokenClaims(token, FAKE_JWKS)
    expect(result.ok).toBe(false)
  })

  it('rejects a token with the wrong audience', async () => {
    const token = signFakeToken({ aud: 'some-other-project' })
    const result = await verifyIdTokenClaims(token, FAKE_JWKS)
    expect(result.ok).toBe(false)
  })

  it('rejects a token with no subject claim', async () => {
    const token = signFakeToken({ sub: undefined })
    const result = await verifyIdTokenClaims(token, FAKE_JWKS)
    expect(result.ok).toBe(false)
  })

  it('rejects a garbage/non-JWT string', async () => {
    const result = await verifyIdTokenClaims('not-a-real-token!!!', FAKE_JWKS)
    expect(result.ok).toBe(false)
  })
})

describe('verifyAuthToken', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('rejects a request with no Authorization header', async () => {
    const request = fakeRequest()
    const result = await verifyAuthToken(request, FAKE_JWKS)
    expect(result).toEqual({ ok: false, reason: 'missing bearer token' })
  })

  it('rejects a malformed Authorization header (no Bearer prefix)', async () => {
    const request = fakeRequest('not-bearer some-token')
    const result = await verifyAuthToken(request, FAKE_JWKS)
    expect(result.ok).toBe(false)
  })

  it('accepts a request with a valid Bearer token', async () => {
    const token = signFakeToken()
    const request = fakeRequest(`Bearer ${token}`)
    const result = await verifyAuthToken(request, FAKE_JWKS)
    expect(result).toEqual({ ok: true, uid: 'user-123' })
  })

  it('rejects a request with an expired Bearer token', async () => {
    const token = signFakeToken({ exp: Math.floor(Date.now() / 1000) - 3600 })
    const request = fakeRequest(`Bearer ${token}`)
    const result = await verifyAuthToken(request, FAKE_JWKS)
    expect(result.ok).toBe(false)
  })

  describe('dev-bypass', () => {
    it('is inactive by default (no env vars set)', () => {
      delete process.env.VITE_DEV_AUTH_BYPASS
      process.env.NODE_ENV = 'development'
      expect(isDevBypassActive()).toBe(false)
    })

    it('is active when VITE_DEV_AUTH_BYPASS=true and NODE_ENV is not production', () => {
      process.env.VITE_DEV_AUTH_BYPASS = 'true'
      process.env.NODE_ENV = 'development'
      expect(isDevBypassActive()).toBe(true)
    })

    it('is NEVER active when NODE_ENV is production, even if the bypass flag is set', () => {
      process.env.VITE_DEV_AUTH_BYPASS = 'true'
      process.env.NODE_ENV = 'production'
      expect(isDevBypassActive()).toBe(false)
    })

    it('skips real token verification and succeeds with no Authorization header when bypass is active', async () => {
      process.env.VITE_DEV_AUTH_BYPASS = 'true'
      process.env.NODE_ENV = 'development'
      const request = fakeRequest()
      const result = await verifyAuthToken(request, FAKE_JWKS)
      expect(result).toEqual({ ok: true, uid: 'dev-bypass' })
    })
  })
})
