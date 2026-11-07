import '@tanstack/react-start/server-only'

import { getDatabaseWithUrl } from 'firebase-admin/database'

import { AuthenticateUserService } from '../identity'
import { AuthenticatedUserHandler, FirebaseAdminTokenVerifier, getFirebaseAdminApp } from '../identity/server'
import { ListDeletionService } from './application/listDeletion.service'
import { FirebaseAdminListDeletionRepository } from './infrastructure/firebaseAdminListDeletionRepository.server'
import { createListDeleteHandler } from './infrastructure/listDeletionHttp.server'

const databaseUrl = () => {
  const value = process.env.FIREBASE_DATABASE_URL?.trim()
  if (!value) throw new Error('FIREBASE_DATABASE_URL is required')
  return value
}

export const handleListDelete = (request: Request, listId: string, listName: string): Promise<Response> => {
  const app = getFirebaseAdminApp({
    ...process.env,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'n8n-vocal-2-db',
    FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  })
  return createListDeleteHandler({
    authenticatedUserHandler: new AuthenticatedUserHandler({
      authenticationService: new AuthenticateUserService(new FirebaseAdminTokenVerifier(app))
    }),
    service: new ListDeletionService(
      new FirebaseAdminListDeletionRepository(getDatabaseWithUrl(databaseUrl(), app))
    )
  })({ request, listId, listName })
}

export { createListDeleteHandler } from './infrastructure/listDeletionHttp.server'
export { FirebaseAdminListDeletionRepository } from './infrastructure/firebaseAdminListDeletionRepository.server'
