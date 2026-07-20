import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getDatabase, type Database } from 'firebase-admin/database'
import { logger } from './logger'

// Server-only — never import this from client code (a service-account private key must
// never reach the browser bundle). Used by src/routes/api/retry-feedback.tsx (ticket F2,
// the hourly feedback-retry safety net) so it can run a real Firebase Admin SDK
// transaction against /feedbacks — the browser client SDK (src/lib/firebase.ts) has no
// equivalent for "atomically claim this record only if no one else already did," which
// is the actual reason this job needs Admin SDK access instead of reusing the existing
// client-side Firebase setup.
//
// FIREBASE_SERVICE_ACCOUNT_KEY (the full service-account JSON, as one env var string) is
// NOT YET PROVISIONED as of this writing — same category as this project's other
// outstanding credential gaps (GITHUB_RELEASES_TOKEN, see CLAUDE.md's Known gaps #9).
// Until it's set, isFirebaseAdminConfigured() returns false and callers (retry-
// feedback.tsx) must check that first and respond cleanly (503) rather than ever letting
// getAdminDatabase() throw into an unhandled exception.
const DATABASE_URL = 'https://n8n-vocal-2-db-default-rtdb.europe-west1.firebasedatabase.app'
const ADMIN_APP_NAME = 'fridge-list-admin'

export class FirebaseAdminNotConfiguredError extends Error {
  constructor() {
    super('FIREBASE_SERVICE_ACCOUNT_KEY is not configured')
    this.name = 'FirebaseAdminNotConfiguredError'
  }
}

export const isFirebaseAdminConfigured = (): boolean => !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY

// Lazily initialized and cached across warm serverless invocations, same pattern as
// n8n-write-groceries.tsx's cachedAuth — avoids re-parsing the service account JSON and
// re-calling initializeApp on every request within the same warm instance. Uses a named
// app (not the default) so this can never collide with any other Admin SDK usage that
// might exist in the same process.
let cachedApp: App | null = null

function getAdminApp(): App {
  if (cachedApp) return cachedApp

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new FirebaseAdminNotConfiguredError()

  let serviceAccount: Record<string, unknown>
  try {
    serviceAccount = JSON.parse(raw)
  } catch {
    logger.error('[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_KEY is set but is not valid JSON')
    throw new FirebaseAdminNotConfiguredError()
  }

  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME)
  cachedApp =
    existing ||
    initializeApp(
      {
        credential: cert(serviceAccount as any),
        databaseURL: DATABASE_URL
      },
      ADMIN_APP_NAME
    )
  return cachedApp
}

// Throws FirebaseAdminNotConfiguredError if the credential isn't set — always guard with
// isFirebaseAdminConfigured() first in any route handler (see retry-feedback.tsx) so a
// missing credential produces a clean, logged error response instead of a 500 stack
// trace.
export const getAdminDatabase = (): Database => getDatabase(getAdminApp())
