import { AuthenticateUserService } from './authenticateUser.service'
import type { UserTokenVerifier } from './tokenVerifier'

const createVerifier = (): jest.Mocked<UserTokenVerifier> => ({
  verifyIdToken: jest.fn()
})

describe('AuthenticateUserService', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalDevBypass = process.env.VITE_DEV_AUTH_BYPASS
  const originalDevEmail = process.env.VITE_DEV_AUTH_EMAIL

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    if (originalDevBypass === undefined) delete process.env.VITE_DEV_AUTH_BYPASS
    else process.env.VITE_DEV_AUTH_BYPASS = originalDevBypass
    if (originalDevEmail === undefined) delete process.env.VITE_DEV_AUTH_EMAIL
    else process.env.VITE_DEV_AUTH_EMAIL = originalDevEmail
  })

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

  it('uses the configured local dev principal when auth bypass is enabled', async () => {
    process.env.NODE_ENV = 'development'
    process.env.VITE_DEV_AUTH_BYPASS = 'true'
    process.env.VITE_DEV_AUTH_EMAIL = 'dev@example.com'
    const verifier = createVerifier()

    await expect(new AuthenticateUserService(verifier).execute(null)).resolves.toEqual({
      kind: 'user',
      uid: 'dev-bypass',
      email: 'dev@example.com',
      emailVerified: true
    })
    expect(verifier.verifyIdToken).not.toHaveBeenCalled()
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
