/**
 * @jest-environment node
 *
 * Node environment so the real Fetch API's Request/Response globals are available —
 * this route handler uses both directly. Firebase is mocked at the module boundary
 * (see .claude/skills/senior-qa-jest) — these tests must never touch the real
 * n8n-vocal-2-db project.
 */
const initializeAppMock = jest.fn((..._args: unknown[]) => ({ name: 'mock-app' }))
const signInAnonymouslyMock = jest.fn((..._args: unknown[]) => Promise.resolve())
const getAuthMock = jest.fn((..._args: unknown[]) => ({ currentUser: null, app: { name: 'mock-app' } }))
const pushMock = jest.fn((..._args: unknown[]) => Promise.resolve({ key: 'new-key-123' }))
const updateMock = jest.fn((..._args: unknown[]) => Promise.resolve())
const refMock = jest.fn((..._args: unknown[]) => ({ path: _args[1] as string }))
const getDatabaseMock = jest.fn((..._args: unknown[]) => ({}))

jest.mock('firebase/app', () => ({ initializeApp: (...args: unknown[]) => initializeAppMock(...args) }))
jest.mock('firebase/auth', () => ({
  getAuth: (...args: unknown[]) => getAuthMock(...args),
  signInAnonymously: (...args: unknown[]) => signInAnonymouslyMock(...args)
}))
jest.mock('firebase/database', () => ({
  getDatabase: (...args: unknown[]) => getDatabaseMock(...args),
  ref: (...args: unknown[]) => refMock(...args),
  push: (...args: unknown[]) => pushMock(...args),
  update: (...args: unknown[]) => updateMock(...args)
}))

import { Route } from './n8n-write-groceries'

const postHandler = (Route.options.server as any).handlers.POST

const callPost = (body: unknown, headers: Record<string, string> = {}) =>
  postHandler({
    request: new Request('http://localhost/api/n8n-write-groceries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    })
  })

const SECRET = 'test-secret-value'

describe('POST /api/n8n-write-groceries', () => {
  const originalEnv = process.env.N8N_WRITE_SECRET

  beforeEach(() => {
    process.env.N8N_WRITE_SECRET = SECRET
    initializeAppMock.mockClear()
    signInAnonymouslyMock.mockClear()
    getAuthMock.mockClear()
    pushMock.mockClear()
    updateMock.mockClear()
    refMock.mockClear()
  })

  afterAll(() => {
    process.env.N8N_WRITE_SECRET = originalEnv
  })

  it('returns 500 and never touches Firebase when the server secret is not configured', async () => {
    delete process.env.N8N_WRITE_SECRET
    const response = await callPost(
      { action: 'insert', key: null, item: 'חלב', category: 'מוצרי חלב', added_at: '2026-01-01T00:00:00.000Z' },
      { 'x-n8n-secret': SECRET }
    )
    expect(response.status).toBe(500)
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('returns 401 and never touches Firebase when the secret header is missing or wrong', async () => {
    const response = await callPost(
      { action: 'insert', key: null, item: 'חלב', category: 'מוצרי חלב', added_at: '2026-01-01T00:00:00.000Z' },
      { 'x-n8n-secret': 'wrong' }
    )
    expect(response.status).toBe(401)
    expect(pushMock).not.toHaveBeenCalled()
    expect(signInAnonymouslyMock).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid action', async () => {
    const response = await callPost(
      { action: 'delete', key: null, item: 'חלב', category: 'מוצרי חלב', added_at: '2026-01-01T00:00:00.000Z' },
      { 'x-n8n-secret': SECRET }
    )
    expect(response.status).toBe(400)
  })

  it('returns 400 when action is "update" but key is missing', async () => {
    const response = await callPost(
      { action: 'update', key: null, item: 'חלב', category: 'מוצרי חלב', added_at: '2026-01-01T00:00:00.000Z' },
      { 'x-n8n-secret': SECRET }
    )
    expect(response.status).toBe(400)
  })

  it('signs in anonymously and inserts a new item under the default list owner', async () => {
    const response = await callPost(
      {
        action: 'insert',
        key: null,
        item: 'חלב',
        category: 'מוצרי חלב וביצים',
        added_at: '2026-01-01T00:00:00.000Z',
        raw_text: 'נוסף ידנית',
        created_by: null
      },
      { 'x-n8n-secret': SECRET }
    )
    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1)
    expect(refMock).toHaveBeenCalledWith(expect.anything(), 'users/muli_turiel@gmail_com/groceries')
    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ success: true, action: 'insert', key: 'new-key-123' })
  })

  it('updates an existing item by key, setting bought:false', async () => {
    const response = await callPost(
      {
        action: 'update',
        key: 'existing-key-456',
        item: 'חלב',
        category: 'מוצרי חלב וביצים',
        added_at: '2026-01-01T00:00:00.000Z'
      },
      { 'x-n8n-secret': SECRET }
    )
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(refMock).toHaveBeenCalledWith(expect.anything(), 'users/muli_turiel@gmail_com/groceries/existing-key-456')
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ success: true, action: 'update', key: 'existing-key-456' })
  })
})
