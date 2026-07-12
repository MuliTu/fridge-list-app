// Manual mock for the 'jose' package (jest.config.cjs's moduleNameMapper redirects
// every `import ... from 'jose'` here, for every test — same pattern already used for
// `*.md?raw` and `.css` imports in this file's sibling mocks).
//
// Why this exists: jose v6 ships as pure ESM ("type": "module" in its package.json,
// no "require" export condition / no CJS build at all) — Jest's CommonJS-based module
// registry can't load it directly and fails at import time with "Unexpected token
// 'export'". This project has no Babel/ESM transform pipeline set up (ts-jest only
// transforms this app's own .ts/.tsx files), so rather than adding a new toolchain
// just to make one dependency loadable in tests, this fakes the tiny slice of jose's
// API that src/lib/verifyAuthToken.ts actually uses.
//
// `jwtVerify` here decodes a lightweight base64url-JSON "fake JWT" (built by the
// `signFakeToken` helper in verifyAuthToken.test.ts) and re-implements the specific
// claim checks (issuer/audience/requiredClaims/exp) real jose would perform — so tests
// still exercise *this app's own* verification logic (header parsing, claim-mismatch
// handling, error-to-{ok:false} mapping), not jose's internal cryptography, which is
// out of scope here (that's jose's own test suite's job, not ours).

class MockJOSEError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

type FakeClaims = Record<string, unknown> & { iss?: string; aud?: string; sub?: string; exp?: number }

const decodeFakeToken = (token: string): FakeClaims => {
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8')
    return JSON.parse(json)
  } catch {
    throw new MockJOSEError('ERR_JWS_INVALID', 'Invalid Compact JWS')
  }
}

export const jwtVerify = jest.fn(async (token: string, _jwks: unknown, options: any = {}) => {
  const payload = decodeFakeToken(token)

  for (const claim of options.requiredClaims || []) {
    if (payload[claim] === undefined || payload[claim] === null || payload[claim] === '') {
      throw new MockJOSEError('ERR_JWT_CLAIM_VALIDATION_FAILED', `missing required claim "${claim}"`)
    }
  }
  if (options.issuer && payload.iss !== options.issuer) {
    throw new MockJOSEError('ERR_JWT_CLAIM_VALIDATION_FAILED', 'unexpected "iss" claim value')
  }
  if (options.audience && payload.aud !== options.audience) {
    throw new MockJOSEError('ERR_JWT_CLAIM_VALIDATION_FAILED', 'unexpected "aud" claim value')
  }
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new MockJOSEError('ERR_JWT_EXPIRED', '"exp" claim timestamp check failed')
  }

  return { payload, protectedHeader: { alg: 'RS256' } }
})

export const createRemoteJWKSet = jest.fn(() => 'mock-remote-jwks')
export const createLocalJWKSet = jest.fn(() => 'mock-local-jwks')
