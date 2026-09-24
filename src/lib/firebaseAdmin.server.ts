import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getDatabase, type Database } from 'firebase-admin/database'
import { logger } from './logger'

// Server-only; never import this from client code because a service-account private key
// must never reach the browser bundle. The retry job uses Admin SDK transactions to
// atomically claim feedback records.
const ADMIN_APP_NAME = 'fridge-list-admin'

export class FirebaseAdminNotConfiguredError extends Error {
  constructor() {
    super('Firebase Admin is not configured')
    this.name = 'FirebaseAdminNotConfiguredError'
  }
}

const serviceAccountJson = (): string | undefined =>
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY

const databaseUrl = (): string | undefined =>
  process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL

export const isFirebaseAdminConfigured = (): boolean =>
  !!serviceAccountJson() && !!databaseUrl()

// Lazily initialized and cached across warm serverless invocations, same pattern as
// n8n-write-groceries.tsx's cachedAuth — avoids re-parsing the service account JSON and
// re-calling initializeApp on every request within the same warm instance. Uses a named
// app (not the default) so this can never collide with any other Admin SDK usage that
// might exist in the same process.
let cachedApp: App | null = null

const getAdminApp = (): App => {
  if (cachedApp) return cachedApp

  const raw = serviceAccountJson()
  const url = databaseUrl()
  if (!raw || !url) throw new FirebaseAdminNotConfiguredError()

  let serviceAccount: Record<string, unknown>
  try {
    serviceAccount = JSON.parse(raw)
  } catch {
    logger.error('[firebaseAdmin] Firebase service account env var is set but is not valid JSON')
    throw new FirebaseAdminNotConfiguredError()
  }

  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME)
  cachedApp =
    existing ||
    initializeApp(
      {
        credential: cert(serviceAccount as any),
        databaseURL: url
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
