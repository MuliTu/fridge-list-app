/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import * as identityServer from './identity/server'
import * as groceryServer from './groceries/server'
import * as recipeServer from './recipes/server'

import { ServerComposition, type ServerEnvironment } from './composition.server'

const serviceAccount = JSON.stringify({
  client_email: 'firebase-admin@example.test',
  private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----'
})

const completeEnvironment: ServerEnvironment = {
  FIREBASE_DATABASE_URL: 'https://example-default-rtdb.europe-west1.firebasedatabase.app',
  FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccount,
  GITHUB_RELEASES_TOKEN: 'github-token',
  N8N_ALLOWED_LIST_ID: 'household-list',
  N8N_WRITE_SECRET: 'a-long-test-secret'
}

describe('ServerComposition', () => {
  it('constructs and caches the n8n grocery capability in one root', () => {
    const composition = new ServerComposition({ environment: completeEnvironment })

    const first = composition.getN8nGroceryWriteDependencies()
    const second = composition.getN8nGroceryWriteDependencies()

    expect(second).toBe(first)
    expect(second.service).toBe(first.service)
  })

  it('wires grocery commands through the shared Admin app and write authorization', async () => {
    const app = {} as any
    const insert = jest.fn().mockResolvedValue('key')
    const assertAccessible = jest.fn()
    const appSpy = jest.spyOn(identityServer, 'getFirebaseAdminApp').mockReturnValue(app)
    const repoSpy = jest.spyOn(groceryServer, 'createFirebaseSdkGroceryRepository').mockReturnValue({ insert } as any)
    const authSpy = jest.spyOn(recipeServer, 'createFirebaseAdminListAuthorizationRepository').mockReturnValue({ assertAccessible } as any)
    try {
      const composition = new ServerComposition({ environment: completeEnvironment })
      const principal = { kind: 'user' as const, uid: 'user-1', email: null, emailVerified: true }
      await expect(composition.getGroceryCommandService().add({ principal, requestId: 'r', now: new Date() }, 'list-1', {
        name: 'Milk', category: 'Dairy'
      })).resolves.toEqual({ key: 'key' })
      expect(assertAccessible).toHaveBeenCalledWith(principal, 'list-1', 'write')
      expect(repoSpy).toHaveBeenCalledWith(app, completeEnvironment.FIREBASE_DATABASE_URL)
    } finally {
      appSpy.mockRestore(); repoSpy.mockRestore(); authSpy.mockRestore()
    }
  })

  it('constructs and caches releases and observability services', () => {
    const composition = new ServerComposition({ environment: completeEnvironment })

    expect(composition.getReleasesService()).toBe(
      composition.getReleasesService()
    )
    expect(composition.getRecordClientEventService()).toBe(
      composition.getRecordClientEventService()
    )
  })

  it('constructs and caches categorization and feedback services', () => {
    const composition = new ServerComposition({ environment: completeEnvironment })

    expect(composition.getCategorizeItemService()).toBe(
      composition.getCategorizeItemService()
    )
    expect(composition.getSubmitFeedbackService()).toBe(
      composition.getSubmitFeedbackService()
    )
  })

  it('defers optional releases configuration failure until service execution', async () => {
    const composition = new ServerComposition({
      environment: { ...completeEnvironment, GITHUB_RELEASES_TOKEN: undefined }
    })
    const context = {
      principal: {
        kind: 'user' as const,
        uid: 'user-1',
        email: null,
        emailVerified: false
      },
      requestId: 'request-1',
      now: new Date('2026-08-02T12:00:00.000Z')
    }

    await expect(
      composition.getReleasesService().execute(context)
    ).rejects.toEqual(expect.objectContaining({ code: 'unavailable' }))
  })

  it('injects request IDs and clocks into machine request contexts', () => {
    const now = new Date('2026-08-02T12:00:00.000Z')
    const composition = new ServerComposition({
      environment: completeEnvironment,
      generateRequestId: () => 'composition-request-id',
      now: () => now
    })
    const headers = new Headers({ 'x-n8n-secret': 'a-long-test-secret' })

    const context = composition
      .getN8nGroceryWriteDependencies()
      .authenticateRequest(headers)

    expect(context.requestId).toBe('composition-request-id')
    expect(context.now).toBe(now)
    expect(context.principal.allowedListIds).toEqual(new Set(['household-list']))
  })

  it.each([
    'N8N_WRITE_SECRET',
    'N8N_ALLOWED_LIST_ID',
    'FIREBASE_DATABASE_URL',
    'FIREBASE_SERVICE_ACCOUNT_JSON'
  ] as const)('fails closed when %s is missing', (missingKey) => {
    const environment = { ...completeEnvironment, [missingKey]: undefined }
    const composition = new ServerComposition({ environment })

    expect(() => composition.getN8nGroceryWriteDependencies()).toThrow(
      expect.objectContaining({ code: 'not_configured' })
    )
  })

  it('rejects malformed provider configuration without exposing its value', () => {
    const secretValue = 'not-json-super-secret'
    const composition = new ServerComposition({
      environment: {
        ...completeEnvironment,
        FIREBASE_SERVICE_ACCOUNT_JSON: secretValue
      }
    })

    let thrown: unknown
    try {
      composition.getN8nGroceryWriteDependencies()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toEqual(
      expect.objectContaining({ code: 'not_configured' })
    )
    expect(String(thrown)).not.toContain(secretValue)
  })

  it.each([
    'http://example.test',
    'https://user:password@example.test',
    'https://example.test/not-the-root',
    'https://example.test/?secret=query'
  ])('rejects an unsafe Firebase database URL: %s', (databaseUrl) => {
    const composition = new ServerComposition({
      environment: { ...completeEnvironment, FIREBASE_DATABASE_URL: databaseUrl }
    })

    expect(() => composition.getN8nGroceryWriteDependencies()).toThrow(
      expect.objectContaining({ code: 'not_configured' })
    )
  })
})
