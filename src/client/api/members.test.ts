import { createMembersApiClient } from './members'

describe('members API client', () => {
  it('scopes summary and leave requests to the selected list and authenticates them', async () => {
    const fetchMock = jest.fn(async (_path: string, init?: RequestInit) => ({
      ok: true,
      status: init?.method === 'DELETE' ? 204 : 200,
      json: async () => ({ listId: 'list-a', name: 'A', ownerEmail: 'owner@example.com', isOwner: false, members: [] })
    }))
    const client = createMembersApiClient({ getIdToken: async () => 'token', fetch: fetchMock as unknown as typeof fetch })
    await client.getSummary('list/a')
    await client.leave('list/a')
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/lists/list%2Fa/members', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token' })
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/lists/list%2Fa/members', expect.objectContaining({ method: 'DELETE' }))
  })

  it('sends invitation language only through the owner-scoped member endpoint', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 204 }))
    const client = createMembersApiClient({ getIdToken: async () => 'token', fetch: fetchMock as unknown as typeof fetch })
    await client.setNotificationLanguage('list-a', 'member@example.com', 'en')
    expect(fetchMock).toHaveBeenCalledWith('/api/lists/list-a/members/member%40example.com', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ notificationLanguage: 'en' })
    }))
  })
})
