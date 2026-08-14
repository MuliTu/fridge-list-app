/** @jest-environment node */

import { createGroceryApiClient, GroceryApiError } from './groceries'

describe('grocery API client', () => {
  it('sends typed authenticated commands with encoded scope IDs', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: 'item-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    const client = createGroceryApiClient({
      getIdToken: async () => 'id-token',
      fetch: fetchMock
    })

    await expect(
      client.add('owner/list', { name: 'Milk', category: 'Dairy' })
    ).resolves.toEqual({ key: 'item-1' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/lists/owner%2Flist/groceries',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer id-token' })
      })
    )
  })

  it('maps safe server errors and never exposes an unparseable response', async () => {
    const responses = [
      new Response(
        JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }),
        { status: 403 }
      ),
      new Response('provider secret', { status: 502 })
    ]
    const client = createGroceryApiClient({
      getIdToken: async () => undefined,
      fetch: jest.fn(async () => responses.shift()!)
    })

    await expect(client.delete('list', 'item')).rejects.toEqual(
      new GroceryApiError(403, 'FORBIDDEN', 'Forbidden')
    )
    await expect(client.delete('list', 'item')).rejects.toEqual(
      new GroceryApiError(502, 'REQUEST_FAILED', 'Grocery request failed')
    )
  })

  it('supports purchase, update, and delete command shapes', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const client = createGroceryApiClient({ getIdToken: async () => 'token', fetch: fetchMock })

    await client.update('list', 'item', { category: 'Produce' })
    await client.setPurchased('list', 'item', true)
    await client.delete('list', 'item')

    expect(fetchMock.mock.calls.map(([path, init]) => [path, init.method])).toEqual([
      ['/api/lists/list/groceries/item', 'PATCH'],
      ['/api/lists/list/groceries/item/purchased', 'PUT'],
      ['/api/lists/list/groceries/item', 'DELETE']
    ])
  })
})
