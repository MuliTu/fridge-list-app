import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { logger } from './logger'

// Server-only. Verifies a Firebase Auth ID token's JWT signature manually against
// Google's public JWKS for Firebase Auth, instead of the firebase-admin SDK's
// `admin.auth().verifyIdToken()` — this project has no Firebase Admin / service-account
// credential available at all (see .claude/skills/firebase-data-model), so a real
// Admin SDK verification isn't an option here.
//
// Used by the 4 server routes that proxy to n8n/Gemini or Trello and were previously
// completely unauthenticated (scan-receipt, scan-receipt-url, categorize-item,
// submit-feedback) — see Trello cards security-2/security-3. Those flows are already
// gated behind canEdit/sign-in in the UI; this closes the gap where the route itself
// never checked that server-side, letting an anonymous script hit them directly and
// burn the shared Gemini free-tier quota (20 req/day) or spam Trello.
export const FIREBASE_PROJECT_ID = 'n8n-vocal-2-db' // == firebaseConfig.projectId in src/lib/firebase.ts
const ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
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
export const verifyIdTokenClaims = async (token: string, jwks: JWTVerifyGetKey): Promise<AuthCheckResult> => {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: FIREBASE_PROJECT_ID,
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
// Scope decision, deliberate: this only proves "some valid, currently-signed-in
// Google/Firebase-authenticated user made this request" — it does NOT check that the
// user is an invited household editor (ADMIN_EMAILS / the live /admins path). Doing
// that server-side isn't reliably possible right now: `/admins` currently has no RTDB
// read rule applied (see .claude/skills/firebase-data-model), so a server-side get()
// against it would itself get permission-denied. Both security tickets this fixes
// (security-2, security-3) ask for "require sign-in" as the fix, not full
// authorization-list enforcement — narrowing the previously-open-to-the-internet
// surface down to "any signed-in Google account" is the intended, scoped fix here.
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
