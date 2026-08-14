import { AuthenticateUserService } from './authenticateUser.service'
import type { UserTokenVerifier } from './tokenVerifier'

const createVerifier = (): jest.Mocked<UserTokenVerifier> => ({
  verifyIdToken: jest.fn()
})

describe('AuthenticateUserService', () => {
  it('creates a user principal from a verified bearer token', async () => {
    const verifier = createVerifier()
    verifier.verifyIdToken.mockResolvedValue({
      uid: 'user-1',
      email: 'user@example.com',
      emailVerified: true
    })

    const principal = await new AuthenticateUserService(verifier).execute('Bearer token-value')

    expect(verifier.verifyIdToken).toHaveBeenCalledWith('token-value')
    expect(principal).toEqual({
      kind: 'user',
      uid: 'user-1',
      email: 'user@example.com',
      emailVerified: true
    })
  })

  it.each([null, '', 'Basic value', 'Bearer '])('rejects a missing or malformed header: %p', async (header) => {
    const verifier = createVerifier()

    await expect(new AuthenticateUserService(verifier).execute(header)).rejects.toMatchObject({
      code: 'unauthenticated'
    })
    expect(verifier.verifyIdToken).not.toHaveBeenCalled()
  })

  it('maps verifier failures to a safe authentication error', async () => {
    const verifier = createVerifier()
    verifier.verifyIdToken.mockRejectedValue(new Error('provider detail'))

    await expect(new AuthenticateUserService(verifier).execute('Bearer bad-token')).rejects.toEqual(
      expect.objectContaining({
        code: 'unauthenticated',
        message: 'Invalid or expired bearer token'
      })
    )
  })

  it('rejects an expired token without exposing verifier details', async () => {
    const verifier = createVerifier()
    verifier.verifyIdToken.mockRejectedValue(new Error('Firebase token-expired provider detail'))

    await expect(new AuthenticateUserService(verifier).execute('Bearer expired-token')).rejects.toEqual(
      expect.objectContaining({
        code: 'unauthenticated',
        message: 'Invalid or expired bearer token'
      })
    )
  })
})
