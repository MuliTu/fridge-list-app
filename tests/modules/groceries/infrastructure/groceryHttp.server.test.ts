/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { AuthenticatedUserHandler } from '../../../../src/modules/identity/server'
import type { GroceryCommandService } from '../../../../src/modules/groceries/application/groceryCommands.service'
import {
  createGroceryCollectionPostHandler,
  createGroceryItemDeleteHandler,
  createGroceryItemPatchHandler,
  createGroceryPurchasedPutHandler
} from '../../../../src/modules/groceries/infrastructure/groceryHttp.server'

const principal = {
  kind: 'user' as const,
  uid: 'user-1',
  email: 'user@example.test',
  emailVerified: true
}

const setup = () => {
  const service = {
    add: jest.fn().mockResolvedValue({ key: 'item-1' }),
    update: jest.fn().mockResolvedValue(undefined),
    updateDetails: jest.fn().mockResolvedValue(undefined),
    setPurchased: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined)
  } as unknown as jest.Mocked<GroceryCommandService>
  const authenticatedUserHandler = new AuthenticatedUserHandler({
    authenticationService: { execute: jest.fn().mockResolvedValue(principal) },
    generateRequestId: () => 'request-1',
    now: () => new Date('2026-08-02T12:00:00.000Z')
  })
  return { service, authenticatedUserHandler }
}

const request = (method: string, body?: unknown) =>
  new Request('http://localhost/api/groceries', {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })

describe('grocery HTTP adapters', () => {
  it('maps add input and authenticated context to the command service', async () => {
    const dependencies = setup()
    const response = await createGroceryCollectionPostHandler(dependencies)({
      request: request('POST', { name: 'Milk', category: 'Dairy' }),
      listId: 'list-1'
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ key: 'item-1' })
    expect(dependencies.service.add).toHaveBeenCalledWith(
      expect.objectContaining({ principal, requestId: 'request-1' }),
      'list-1',
      { name: 'Milk', category: 'Dairy' }
    )
  })

  it('routes category and detail patches to the matching command', async () => {
    const dependencies = setup()
    const patch = createGroceryItemPatchHandler(dependencies)

    await patch({ request: request('PATCH', { category: 'Produce' }), listId: 'list', itemId: 'item' })
    await patch({ request: request('PATCH', { name: 'Oat milk', note: 'Two' }), listId: 'list', itemId: 'item' })

    expect(dependencies.service.update).toHaveBeenCalledWith(
      expect.anything(), 'list', 'item', { category: 'Produce' }
    )
    expect(dependencies.service.updateDetails).toHaveBeenCalledWith(
      expect.anything(), 'list', 'item', { name: 'Oat milk', note: 'Two' }
    )
  })

  it('maps purchased and delete requests without parsing delete bodies', async () => {
    const dependencies = setup()

    const purchased = await createGroceryPurchasedPutHandler(dependencies)({
      request: request('PUT', { bought: true }), listId: 'list', itemId: 'item'
    })
    const deleted = await createGroceryItemDeleteHandler(dependencies)({
      request: request('DELETE'), listId: 'list', itemId: 'item'
    })

    expect(purchased.status).toBe(204)
    expect(deleted.status).toBe(204)
    expect(dependencies.service.setPurchased).toHaveBeenCalledWith(expect.anything(), 'list', 'item', true)
    expect(dependencies.service.delete).toHaveBeenCalledWith(expect.anything(), 'list', 'item')
  })
})
