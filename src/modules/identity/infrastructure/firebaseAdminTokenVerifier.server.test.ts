jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn() }))

import { getAuth } from 'firebase-admin/auth'
import { FirebaseAdminTokenVerifier } from './firebaseAdminTokenVerifier.server'

const verifyIdToken = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  ;(getAuth as jest.Mock).mockReturnValue({ verifyIdToken })
})

it('rejects an anonymous token even when it contains a UID', async () => {
  verifyIdToken.mockResolvedValue({ uid: 'anonymous-owner', firebase: { sign_in_provider: 'anonymous' } })
  await expect(new FirebaseAdminTokenVerifier({} as any).verifyIdToken('token')).rejects.toThrow('Anonymous')
})

it('accepts a verified non-anonymous token and normalizes claims', async () => {
  verifyIdToken.mockResolvedValue({ uid: 'member', email: 'member@example.test', email_verified: true, firebase: { sign_in_provider: 'password' } })
  await expect(new FirebaseAdminTokenVerifier({} as any).verifyIdToken('token')).resolves.toEqual({
    uid: 'member', email: 'member@example.test', emailVerified: true
  })
  expect(verifyIdToken).toHaveBeenCalledWith('token')
})
