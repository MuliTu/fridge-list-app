import '@tanstack/react-start/server-only'

import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import type { UserTokenVerifier, VerifiedUser } from '../application/tokenVerifier'
import { assertDemoRuntimeEnvironment } from '../../../lib/demoRuntime'
import demoConfiguration from '../../../../demo.config.json'

type FirebaseAdminEnvironment = {
  FIREBASE_PROJECT_ID?: string
  FIREBASE_SERVICE_ACCOUNT_JSON?: string
  FRIDGE_DEMO_MODE?: string
  [key: string]: string | undefined
}

const parseServiceAccount = (value: string): Parameters<typeof cert>[0] => {
  try {
    return JSON.parse(value) as Parameters<typeof cert>[0]
  } catch (error) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON', { cause: error })
  }
}

export const getFirebaseAdminApp = (environment: FirebaseAdminEnvironment): App => {
  if (environment.FRIDGE_DEMO_MODE === 'true') {
    assertDemoRuntimeEnvironment(environment, process.env)
    const name = 'fridge-isolated-demo'
    const existingDemo = getApps().find((app) => app.name === name)
    if (existingDemo) return existingDemo
    return initializeApp({
      projectId: demoConfiguration.FIREBASE_PROJECT_ID,
      databaseURL: demoConfiguration.FIREBASE_DATABASE_URL
    }, name)
  }
  const existing = getApps()[0]
  if (existing) return existing

  const projectId = environment.FIREBASE_PROJECT_ID
  const credential = environment.FIREBASE_SERVICE_ACCOUNT_JSON
    ? cert(parseServiceAccount(environment.FIREBASE_SERVICE_ACCOUNT_JSON))
    : applicationDefault()

  return initializeApp({ credential, ...(projectId ? { projectId } : {}) })
}

export class FirebaseAdminTokenVerifier implements UserTokenVerifier {
  constructor(private readonly app: App) {}

  async verifyIdToken(token: string): Promise<VerifiedUser> {
    const decoded = await getAuth(this.app).verifyIdToken(token)
    if (decoded.firebase?.sign_in_provider === 'anonymous') {
      throw new Error('Anonymous authentication is not supported')
    }
    return {
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : null,
      emailVerified: decoded.email_verified === true
    }
  }
}
