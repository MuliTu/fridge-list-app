import { ApplicationError, type UserPrincipal } from '../../shared'
import type { UserTokenVerifier } from './tokenVerifier'

const isDevBypassActive = (): boolean =>
  process.env.NODE_ENV !== 'production' && process.env.VITE_DEV_AUTH_BYPASS === 'true'

export class AuthenticateUserService {
  constructor(private readonly tokenVerifier: UserTokenVerifier) {}

  async execute(authorizationHeader: string | null): Promise<UserPrincipal> {
    if (isDevBypassActive()) {
      return {
        kind: 'user',
        uid: 'dev-bypass',
        email: process.env.VITE_DEV_AUTH_EMAIL || 'dev@example.com',
        emailVerified: true
      }
    }

    const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i)
    if (!match?.[1]) {
      throw new ApplicationError('unauthenticated', 'Missing bearer token')
    }

    try {
      const verified = await this.tokenVerifier.verifyIdToken(match[1])
      if (!verified.uid) {
        throw new ApplicationError('unauthenticated', 'Token has no user identity')
      }
      return {
        kind: 'user',
        uid: verified.uid,
        email: verified.email,
        emailVerified: verified.emailVerified
      }
    } catch (error) {
      if (error instanceof ApplicationError) throw error
      throw new ApplicationError('unauthenticated', 'Invalid or expired bearer token', error)
    }
  }
}
