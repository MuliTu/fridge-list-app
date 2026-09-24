import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { logger } from './logger'

// Server-only. Verifies a Firebase Auth ID token's JWT signature manually against
// Google's public JWKS for Firebase Auth.
//
// Used by the 4 server routes that proxy to n8n/Gemini or Trello and were previously
// completely unauthenticated (scan-receipt, scan-receipt-url, categorize-item,
// submit-feedback). Those flows are already gated behind canEdit/sign-in in the UI;
// this closes the route-level gap where an anonymous script could hit them directly.
const configuredProjectId = (): string | null => {
  const value =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.VITE_FIREBASE_PROJECT_ID?.trim()
  if (value) return value
  if (process.env.NODE_ENV === 'test') return 'test-project'
  return null
}

const requiredProjectId = (): string => {
  const value = configuredProjectId()
  if (value) return value
  throw new Error('Missing Firebase project configuration: FIREBASE_PROJECT_ID')
}

export const FIREBASE_PROJECT_ID = configuredProjectId() ?? 'server-render-placeholder'
const issuerForProject = (projectId: string) => `https://securetoken.google.com/${projectId}`
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

// createRemoteJWKSet fetches + caches Google's public keys internally (honors the
// endpoint's own cache-control), so build it once per server process rather than
// per-request.
let remoteJwks: JWTVerifyGetKey | null = null
const getRemoteJwks = (): JWTVerifyGetKey => {
  if (!remoteJwks) remoteJwks = createRemoteJWKSet(new URL(JWKS_URL))
  return remoteJwks
}

// This project's local-dev auth bypass (.env.local, VITE_DEV_AUTH_BYPASS=true, see
// src/hooks/AuthContext.tsx) signs the developer in as a fake CLIENT-SIDE-ONLY user
// with no real Firebase Auth session — auth.currentUser is null, so there's no real ID
// token the client can send. Without this server-side mirror of that same flag, every
// canEdit-gated flow that hits one of these 4 routes (receipt scan, categorize item,
// feedback submit) would 401 in local dev, breaking that documented workflow.
//
// Vite loads .env.local into process.env for the server process too, not just as
// import.meta.env.VITE_* inlined into the client bundle — this codebase already
// relies on that exact behavior for non-VITE_-prefixed vars (see
// src/routes/api/send-invite-email.tsx's SMTP_HOST/SMTP_PORT/etc reads), so reading
// VITE_DEV_AUTH_BYPASS the same way here is consistent, not a new assumption.
// Additionally gated on NODE_ENV !== 'production' so this can never activate in a
// real deployed build no matter what an env file says — Vercel sets NODE_ENV to
// "production" for production deployments, and this app's own .env.local is
// gitignored and never shipped.
export const isDevBypassActive = (): boolean =>
  process.env.NODE_ENV !== 'production' && process.env.VITE_DEV_AUTH_BYPASS === 'true'

export type AuthCheckResult = { ok: true; uid: string } | { ok: false; reason: string }

// Verifies the JWT's signature + standard claims against a given JWKS resolver.
// Exported separately (not just inlined into verifyAuthToken) so tests can exercise
// jose's *real* verification logic against a local, in-memory JWKS (jose's
// createLocalJWKSet) instead of either hitting the real Google endpoint or mocking
// the 'jose' module wholesale — mirrors this repo's existing pattern of exporting
// internals for direct testing (see scan-receipt-url.tsx's __ssrfInternals).
export const verifyIdTokenClaims = async (
  token: string,
  jwks: JWTVerifyGetKey,
  projectId = requiredProjectId()
): Promise<AuthCheckResult> => {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: issuerForProject(projectId),
      audience: projectId,
      requiredClaims: ['exp', 'sub']
    })
    const uid = typeof payload.sub === 'string' && payload.sub ? payload.sub : ''
    if (!uid) return { ok: false, reason: 'missing subject claim' }
    return { ok: true, uid }
  } catch (err: any) {
    return { ok: false, reason: err?.code || err?.message || 'invalid token' }
  }
}

// Reads `Authorization: Bearer <idToken>` off the request and verifies it. Returns
// `{ ok: false, reason }` for anything short of a valid, current, correctly-issued
// Firebase ID token — callers should respond 401 on `ok: false` and log the reason
// via logger.warn (see the 4 call sites), same "log the rejection" pattern already
// used elsewhere (e.g. scan-receipt-url.tsx's "missing url"/"blocked url" 400s).
//
// `jwks` is an optional override purely for tests (pass a local jose.createLocalJWKSet
// resolver to exercise this function's full flow, including header parsing, against a
// self-signed token with no network call) — real callers never pass a second argument,
// so production always resolves keys from the real Google JWKS endpoint.
//
// Scope decision: this proves "some valid, currently-signed-in Firebase user made
// this request." Resource-level membership checks belong in the individual
// application services that have a target list/household to authorize against.
export const verifyAuthToken = async (request: Request, jwks: JWTVerifyGetKey = getRemoteJwks()): Promise<AuthCheckResult> => {
  if (isDevBypassActive()) {
    logger.warn('[verifyAuthToken] dev-bypass active (VITE_DEV_AUTH_BYPASS=true, non-production) — skipping real token verification')
    return { ok: true, uid: 'dev-bypass' }
  }

  const authHeader = request.headers.get('authorization')
  const match = authHeader ? /^Bearer\s+(.+)$/i.exec(authHeader) : null
  if (!match) return { ok: false, reason: 'missing bearer token' }

  return verifyIdTokenClaims(match[1], jwks)
}
