/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
jest.mock('../../modules/composition.server', () => ({
  getAuthenticatedUserHandler: jest.fn(),
  getCategorizeItemService: jest.fn()
}))

import type { CategorizeItemService } from '../../modules/catalog'
import { AuthenticatedUserHandler } from '../../modules/identity/server'
import { ApplicationError } from '../../modules/shared'
import { createCategorizeItemHandler } from './categorize-item'

const request = (body: string, authorization?: string) =>
  new Request('http://localhost/api/categorize-item', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {})
    },
    body
  })

const authenticatedHandler = () =>
  new AuthenticatedUserHandler({
    authenticationService: {
      execute: jest.fn().mockResolvedValue({
        kind: 'user', uid: 'user-1', email: null, emailVerified: false
      })
    },
    generateRequestId: () => 'request-1'
  })

describe('POST /api/categorize-item', () => {
  const categorizeItem = { execute: jest.fn() } as unknown as jest.Mocked<CategorizeItemService>

  beforeEach(() => jest.clearAllMocks())

  it('returns 401 and performs no parsing or provider-backed service work anonymously', async () => {
    const authenticatedUserHandler = new AuthenticatedUserHandler({
      authenticationService: {
        execute: jest.fn().mockRejectedValue(new ApplicationError('unauthenticated', 'Missing bearer token'))
      }
    })

    const response = await createCategorizeItemHandler({ authenticatedUserHandler, categorizeItem })({
      request: request('{private malformed content')
    })

    expect(response.status).toBe(401)
    expect(categorizeItem.execute).not.toHaveBeenCalled()
  })

  it('delegates once and preserves the compatible items response', async () => {
    categorizeItem.execute.mockResolvedValue({
      items: [{ item: 'חלב', category: 'מוצרי חלב' }]
    })

    const response = await createCategorizeItemHandler({
      authenticatedUserHandler: authenticatedHandler(), categorizeItem
    })({ request: request(JSON.stringify({ text: 'חלב' }), 'Bearer token') })

    expect(categorizeItem.execute).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      items: [{ item: 'חלב', category: 'מוצרי חלב' }]
    })
  })

  it('maps malformed JSON to 400 without a service call', async () => {
    const response = await createCategorizeItemHandler({
      authenticatedUserHandler: authenticatedHandler(), categorizeItem
    })({ request: request('{invalid', 'Bearer token') })

    expect(response.status).toBe(400)
    expect(categorizeItem.execute).not.toHaveBeenCalled()
  })
})
