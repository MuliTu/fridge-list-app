import '@tanstack/react-start/server-only'

import { createSign } from 'node:crypto'
import { ApplicationError } from '../../shared'
import type { AdminAccessTokenProvider } from './firebaseAdminGroceryWriteRepository.server'

type ServiceAccount = {
  client_email: string
  private_key: string
  token_uri?: string
}

const TOKEN_URI = 'https://oauth2.googleapis.com/token'
const FIREBASE_DATABASE_SCOPE = 'https://www.googleapis.com/auth/firebase.database'
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email'

const parseServiceAccount = (value: string | undefined): ServiceAccount => {
  if (!value?.trim()) {
    throw new ApplicationError('not_configured', 'FIREBASE_SERVICE_ACCOUNT_JSON is required for server grocery writes')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new ApplicationError('not_configured', 'FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON', error)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ApplicationError('not_configured', 'Firebase service account must be an object')
  }
  const candidate = parsed as Partial<ServiceAccount>
  if (typeof candidate.client_email !== 'string' || !candidate.client_email.trim()) {
    throw new ApplicationError('not_configured', 'Firebase service account client_email is required')
  }
  if (typeof candidate.private_key !== 'string' || !candidate.private_key.includes('PRIVATE KEY')) {
    throw new ApplicationError('not_configured', 'Firebase service account private_key is required')
  }
  if (candidate.token_uri && candidate.token_uri !== TOKEN_URI) {
    throw new ApplicationError('not_configured', 'Firebase service account token_uri is not allowed')
  }
  return {
    client_email: candidate.client_email.trim(),
    private_key: candidate.private_key,
    token_uri: TOKEN_URI
  }
}

const encodeJson = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')

export class FirebaseServiceAccountAccessTokenProvider implements AdminAccessTokenProvider {
  private cachedToken: { value: string; expiresAt: number } | undefined

  constructor(
    private readonly serviceAccount: ServiceAccount,
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  async getAccessToken(): Promise<{ access_token: string }> {
    const nowSeconds = Math.floor(this.now() / 1000)
    if (this.cachedToken && this.cachedToken.expiresAt - 60 > nowSeconds) {
      return { access_token: this.cachedToken.value }
    }

    const header = encodeJson({ alg: 'RS256', typ: 'JWT' })
    const claims = encodeJson({
      iss: this.serviceAccount.client_email,
      sub: this.serviceAccount.client_email,
      aud: TOKEN_URI,
      scope: `${FIREBASE_DATABASE_SCOPE} ${USERINFO_EMAIL_SCOPE}`,
      iat: nowSeconds,
      exp: nowSeconds + 3600
    })
    const unsignedAssertion = `${header}.${claims}`
    let signature: string
    try {
      const signer = createSign('RSA-SHA256')
      signer.update(unsignedAssertion)
      signer.end()
      signature = signer.sign(this.serviceAccount.private_key, 'base64url')
    } catch (error) {
      throw new ApplicationError('not_configured', 'Firebase service account private_key is invalid', error)
    }

    let response: Response
    try {
      response = await this.fetchImplementation(TOKEN_URI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: `${unsignedAssertion}.${signature}`
        })
      })
    } catch (error) {
      throw new ApplicationError('unavailable', 'Firebase service account token request failed', error)
    }

    if (!response.ok) {
      throw new ApplicationError('unavailable', `Firebase service account token endpoint returned HTTP ${response.status}`)
    }
    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      throw new ApplicationError('unavailable', 'Firebase service account token response was invalid', error)
    }
    const token = body && typeof body === 'object' ? (body as { access_token?: unknown }).access_token : null
    const expiresIn = body && typeof body === 'object' ? (body as { expires_in?: unknown }).expires_in : null
    if (typeof token !== 'string' || !token || typeof expiresIn !== 'number' || expiresIn <= 0) {
      throw new ApplicationError('unavailable', 'Firebase service account token response was incomplete')
    }

    this.cachedToken = { value: token, expiresAt: nowSeconds + expiresIn }
    return { access_token: token }
  }
}

export const createFirebaseServiceAccountAccessTokenProvider = (
  serviceAccountJson: string | undefined
): FirebaseServiceAccountAccessTokenProvider =>
  new FirebaseServiceAccountAccessTokenProvider(parseServiceAccount(serviceAccountJson))
