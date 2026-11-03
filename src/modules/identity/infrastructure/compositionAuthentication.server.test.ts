/** @jest-environment node */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
jest.mock('./firebaseAdminTokenVerifier.server', () => ({
  getFirebaseAdminApp: jest.fn(() => ({})),
  FirebaseAdminTokenVerifier: jest.fn(() => ({ verifyIdToken: jest.fn() }))
}))

import { ServerComposition } from '../../composition.server'

it.each(['production', 'test', undefined])('never bypasses token authentication in %p', async (nodeEnv) => {
  const composition = new ServerComposition({ environment: {
    NODE_ENV: nodeEnv, VITE_DEV_AUTH_BYPASS: 'true', VITE_DEV_AUTH_EMAIL: 'synthetic@example.test'
  } })
  await expect(composition.getAuthenticationService().execute(null)).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('injects the explicitly configured identity only in development', async () => {
  const composition = new ServerComposition({ environment: {
    NODE_ENV: 'development', VITE_DEV_AUTH_BYPASS: 'true', VITE_DEV_AUTH_EMAIL: 'synthetic@example.test'
  } })
  await expect(composition.getAuthenticationService().execute(null)).resolves.toMatchObject({ uid: 'dev-bypass', email: 'synthetic@example.test' })
})
