/** @jest-environment node */

import { generateKeyPairSync } from 'node:crypto'

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import {
  createFirebaseServiceAccountAccessTokenProvider,
  FirebaseServiceAccountAccessTokenProvider
} from '../../../../src/modules/groceries/infrastructure/firebaseServiceAccountAccessTokenProvider.server'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const serviceAccount = {
  client_email: 'firebase-admin@example.iam.gserviceaccount.com',
  private_key: privateKeyPem
}

describe('FirebaseServiceAccountAccessTokenProvider', () => {
  it('exchanges a signed, scoped assertion and caches the access token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      Response.json({ access_token: 'oauth-access-token', expires_in: 3600 })
    )
    const provider = new FirebaseServiceAccountAccessTokenProvider(serviceAccount, fetchMock, () => 1_800_000)

    await expect(provider.getAccessToken()).resolves.toEqual({ access_token: 'oauth-access-token' })
    await expect(provider.getAccessToken()).resolves.toEqual({ access_token: 'oauth-access-token' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(options.method).toBe('POST')
    const params = options.body as URLSearchParams
    expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const assertion = params.get('assertion') as string
    const claims = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8'))
    expect(claims).toMatchObject({
      iss: serviceAccount.client_email,
      aud: 'https://oauth2.googleapis.com/token'
    })
    expect(claims.scope).toContain('https://www.googleapis.com/auth/firebase.database')
  })

  it.each([
    undefined,
    '',
    '{not-json',
    JSON.stringify({ client_email: '', private_key: privateKeyPem }),
    JSON.stringify({ client_email: serviceAccount.client_email, private_key: 'not-a-key' }),
    JSON.stringify({ ...serviceAccount, token_uri: 'https://attacker.example/token' })
  ])('fails closed for missing or unsafe service-account configuration', (value) => {
    expect(() => createFirebaseServiceAccountAccessTokenProvider(value)).toThrow(
      expect.objectContaining({ code: 'not_configured' })
    )
  })

  it('does not expose token-endpoint response bodies', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('provider secret', { status: 401 }))
    const provider = new FirebaseServiceAccountAccessTokenProvider(serviceAccount, fetchMock)

    await expect(provider.getAccessToken()).rejects.toMatchObject({
      code: 'unavailable',
      message: 'Firebase service account token endpoint returned HTTP 401'
    })
  })
})
