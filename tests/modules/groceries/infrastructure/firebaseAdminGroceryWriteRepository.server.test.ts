/** @jest-environment node */

const credential = { getAccessToken: jest.fn() }

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import {
  FirebaseAdminGroceryWriteRepository,
  createFirebaseAdminGroceryWriteRepository
} from '../../../../src/modules/groceries/infrastructure/firebaseAdminGroceryWriteRepository.server'

const databaseUrl = 'https://example-default-rtdb.europe-west1.firebasedatabase.app'
const serviceAccountJson = JSON.stringify({
  client_email: 'firebase-admin@example.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----\n'
})
const record = {
  item: 'Milk',
  category: 'Dairy',
  added_at: '2026-08-02T10:30:00.000Z',
  raw_text: null,
  bought: false as const,
  created_by: null
}

const createRepository = (response: Response) => {
  const fetchMock = jest.fn().mockResolvedValue(response)
  const repository = new FirebaseAdminGroceryWriteRepository(databaseUrl, credential, fetchMock)
  return { repository, fetchMock }
}

describe('FirebaseAdminGroceryWriteRepository', () => {
  it('preserves browser grocery optional fields on insert', async () => {
    const fetchMock = jest.fn().mockResolvedValue(Response.json({ name: 'item-1' }))
    const repository = new FirebaseAdminGroceryWriteRepository(
      'https://project.firebaseio.com',
      { getAccessToken: jest.fn().mockResolvedValue({ access_token: 'token' }) },
      fetchMock
    )

    await repository.insert('list-1', {
      item: 'Milk', category: 'Dairy', added_at: '2026-08-14T09:00:00Z', raw_text: 'נוסף ידנית',
      bought: false, created_by: 'user@example.com', list_name: 'Weekly', quantity: 2, unit: 'l'
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      item: 'Milk', category: 'Dairy', added_at: '2026-08-14T09:00:00Z', raw_text: 'נוסף ידנית',
      bought: false, created_by: 'user@example.com', list_name: 'Weekly', quantity: 2, unit: 'l'
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()
    credential.getAccessToken.mockResolvedValue({ access_token: 'admin-access-token' })
  })

  it('uses explicit safe database and service-account configuration', () => {
    const repository = createFirebaseAdminGroceryWriteRepository({
      FIREBASE_DATABASE_URL: `${databaseUrl}/`,
      FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccountJson
    })

    expect(repository).toBeInstanceOf(FirebaseAdminGroceryWriteRepository)
  })

  it.each([{}, { FIREBASE_DATABASE_URL: 'http://insecure.example.test' }, { FIREBASE_DATABASE_URL: 'not a URL' }])(
    'fails closed for missing or unsafe database configuration',
    (environment) => {
      expect(() => createFirebaseAdminGroceryWriteRepository(environment)).toThrow(
        expect.objectContaining({ code: 'not_configured' })
      )
    }
  )

  it('fails closed when the service-account credential is missing', () => {
    expect(() => createFirebaseAdminGroceryWriteRepository({ FIREBASE_DATABASE_URL: databaseUrl })).toThrow(
      expect.objectContaining({ code: 'not_configured' })
    )
  })

  it('inserts through authenticated RTDB REST with an allowlisted payload', async () => {
    const { repository, fetchMock } = createRepository(Response.json({ name: 'new-key' }))

    await expect(repository.insert('owner_email_com', { ...record, admin: true } as any)).resolves.toBe('new-key')

    expect(fetchMock).toHaveBeenCalledWith(`${databaseUrl}/users/owner_email_com/groceries.json`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-access-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    })
  })

  it('reactivates only bought and added_at', async () => {
    const { repository, fetchMock } = createRepository(new Response(null, { status: 200 }))

    await repository.reactivate('owner_email_com', '-firebase-key', {
      bought: false,
      added_at: '2026-08-02T10:30:00.000Z',
      category: 'must-not-be-written'
    } as any)

    expect(fetchMock).toHaveBeenCalledWith(`${databaseUrl}/users/owner_email_com/groceries/-firebase-key.json`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer admin-access-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ bought: false, added_at: '2026-08-02T10:30:00.000Z' })
    })
  })

  it('uses a deterministic Firebase key for retry-safe integration inserts', async () => {
    const { repository, fetchMock } = createRepository(new Response(null, { status: 200 }))

    const first = await repository.insertIdempotent('owner_email_com', 'workflow-run-42', record)
    const second = await repository.insertIdempotent('owner_email_com', 'workflow-run-42', record)

    expect(first).toBe(second)
    expect(first).toMatch(/^integration_[a-f0-9]{40}$/)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${databaseUrl}/users/owner_email_com/groceries/${first}.json`,
      {
        method: 'PUT',
        headers: { Authorization: 'Bearer admin-access-token', 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      }
    )
  })

  it('preserves the current grocery item path for patch and delete', async () => {
    const { repository, fetchMock } = createRepository(new Response(null, { status: 200 }))
    const patch = { bought: true, modified_at: '2026-08-02T10:30:00.000Z', modified_by: 'user@example.com' }

    await repository.update('owner_email_com', '-firebase-key', patch)
    await repository.delete('owner_email_com', '-firebase-key')

    const url = `${databaseUrl}/users/owner_email_com/groceries/-firebase-key.json`
    expect(fetchMock).toHaveBeenNthCalledWith(1, url, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer admin-access-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, url, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer admin-access-token', 'Content-Type': 'application/json' }
    })
  })

  it.each([
    ['bad/list', '-valid-key'],
    ['valid-list', '../escape'],
    ['valid-list', 'bad#key'],
    [' valid-list', '-valid-key']
  ])('rejects unsafe list/item path segments', async (listId, itemKey) => {
    const { repository, fetchMock } = createRepository(new Response(null, { status: 200 }))

    await expect(
      repository.reactivate(listId, itemKey, { bought: false, added_at: '2026-08-02T10:30:00Z' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps credential and upstream failures without leaking response bodies', async () => {
    credential.getAccessToken.mockRejectedValueOnce(new Error('secret detail'))
    const first = createRepository(new Response(null, { status: 200 }))
    await expect(first.repository.insert('valid-list', record)).rejects.toMatchObject({ code: 'unavailable' })

    const second = createRepository(new Response('provider secret', { status: 403 }))
    await expect(second.repository.insert('valid-list', record)).rejects.toMatchObject({
      code: 'upstream_failed',
      message: 'Firebase Realtime Database returned HTTP 403'
    })
  })
})
