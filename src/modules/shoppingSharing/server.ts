import '@tanstack/react-start/server-only'

import { getAuth } from 'firebase-admin/auth'
import { getDatabaseWithUrl } from 'firebase-admin/database'
import { AuthenticateUserService } from '../identity'
import { AuthenticatedUserHandler, FirebaseAdminTokenVerifier, getFirebaseAdminApp, parseJsonRequest } from '../identity/server'
import { ApplicationError } from '../shared'
import { toHttpErrorResponse } from '../shared/server'
import { FirebaseShoppingSharingService } from './infrastructure/firebaseShoppingSharing.server'

const dependencies = () => {
  const app = getFirebaseAdminApp({
    ...process.env,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'n8n-vocal-2-db',
    FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  })
  const service = new FirebaseShoppingSharingService(getDatabaseWithUrl(
    process.env.FIREBASE_DATABASE_URL || 'https://n8n-vocal-2-db-default-rtdb.europe-west1.firebasedatabase.app', app
  ), getAuth(app))
  const handler = new AuthenticatedUserHandler({ authenticationService: new AuthenticateUserService(new FirebaseAdminTokenVerifier(app)) })
  return { service, handler }
}

const json = (value: unknown) => Response.json(value, { headers: { 'Cache-Control': 'private, no-store' } })

export const handleShoppingSharing = async (request: Request): Promise<Response> => {
  try {
    // Enable only after UID backfill and direct-client Rules isolation have been
    // verified. Legacy production rules are not assumed safe for new grants.
    if (process.env.SHOPPING_LIST_SHARING_ENABLED !== 'true' && request.method === 'GET') {
      throw new ApplicationError('unavailable', 'List sharing has not been enabled in this environment')
    }
    const { handler, service } = dependencies()
    return await handler.handle(request,
      request.method === 'GET' ? () => undefined : parseJsonRequest,
      async ({ principal }, input) => {
        // Own-list signup provisions no sharing grants and remains available
        // independently of the feature flag after the rules have been tightened.
        if (process.env.SHOPPING_LIST_SHARING_ENABLED !== 'true' &&
          (!input || typeof input !== 'object' || (input as { action?: unknown }).action !== 'provision')) {
          throw new ApplicationError('unavailable', 'List sharing has not been enabled in this environment')
        }
        return json(request.method === 'GET'
          ? await service.discover(principal)
          : await service.execute(principal, input))
      })
  } catch (error) { return toHttpErrorResponse(error) }
}
