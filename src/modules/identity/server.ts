import '@tanstack/react-start/server-only'

export { FirebaseAdminTokenVerifier, getFirebaseAdminApp } from './infrastructure/firebaseAdminTokenVerifier.server'
export {
  AuthenticatedUserHandler,
  parseJsonRequest,
  USER_REQUEST_ID_HEADER
} from './infrastructure/authenticatedUserHandler.server'
export type {
  AuthenticatedInputParser,
  AuthenticatedUserHandlerDependencies,
  AuthenticatedUserUseCase,
  UserRequestContext
} from './infrastructure/authenticatedUserHandler.server'
