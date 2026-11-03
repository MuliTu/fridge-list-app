/** @jest-environment node */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

const mockVerify = jest.fn()
const mockDiscover = jest.fn()
const mockExecute = jest.fn()
const mockAdminApp = jest.fn((_environment?: unknown) => ({}))
jest.mock('firebase-admin/auth', () => ({ getAuth: () => ({}) }))
jest.mock('firebase-admin/database', () => ({ getDatabaseWithUrl: () => ({}) }))
jest.mock('../identity/server', () => ({
  ...jest.requireActual('../identity/infrastructure/authenticatedUserHandler.server'),
  getFirebaseAdminApp: (environment: unknown) => mockAdminApp(environment),
  FirebaseAdminTokenVerifier: class { verifyIdToken(token: string) { return mockVerify(token) } }
}))
jest.mock('./infrastructure/firebaseShoppingSharing.server', () => ({
  FirebaseShoppingSharingService: class { discover = mockDiscover; execute = mockExecute }
}))

import { handleShoppingSharing } from './server'
import { ApplicationError } from '../shared'

const previousFlag = process.env.SHOPPING_LIST_SHARING_ENABLED
const previousBypass = process.env.VITE_DEV_AUTH_BYPASS
beforeEach(() => {
  process.env.SHOPPING_LIST_SHARING_ENABLED = 'true'
  delete process.env.VITE_DEV_AUTH_BYPASS
  mockVerify.mockReset().mockResolvedValue({ uid: 'guest-uid', email: 'guest@example.com', emailVerified: true })
  mockDiscover.mockReset().mockResolvedValue([])
  mockExecute.mockReset().mockResolvedValue({ ok: true })
  mockAdminApp.mockClear()
})
afterAll(() => {
  if (previousFlag === undefined) delete process.env.SHOPPING_LIST_SHARING_ENABLED
  else process.env.SHOPPING_LIST_SHARING_ENABLED = previousFlag
  if (previousBypass === undefined) delete process.env.VITE_DEV_AUTH_BYPASS
  else process.env.VITE_DEV_AUTH_BYPASS = previousBypass
})

it('does not activate sharing before the explicit deployment gate is enabled', async () => {
  delete process.env.SHOPPING_LIST_SHARING_ENABLED
  const response = await handleShoppingSharing(new Request('https://app.example/api/shopping-sharing'))
  expect(response.status).toBe(503)
  expect(mockDiscover).not.toHaveBeenCalled()
})

it('rejects missing or invalid authentication before reading sharing data', async () => {
  expect((await handleShoppingSharing(new Request('https://app.example/api/shopping-sharing'))).status).toBe(401)
  mockVerify.mockRejectedValue(new Error('bad token'))
  expect((await handleShoppingSharing(new Request('https://app.example/api/shopping-sharing', { headers: { Authorization: 'Bearer invalid' } }))).status).toBe(401)
  expect(mockDiscover).not.toHaveBeenCalled()
})

it('returns only the authenticated user discovery result and forbids caching', async () => {
  const response = await handleShoppingSharing(new Request('https://app.example/api/shopping-sharing', { headers: { Authorization: 'Bearer valid' } }))
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(mockDiscover).toHaveBeenCalledWith(expect.objectContaining({ uid: 'guest-uid', email: 'guest@example.com' }))
})

it('maps denied cross-list requests to 403 without leaking private records', async () => {
  mockExecute.mockRejectedValue(new ApplicationError('forbidden', 'Private list details'))
  const response = await handleShoppingSharing(new Request('https://app.example/api/shopping-sharing', {
    method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'snapshot', shareId: 'guessed' })
  }))
  expect(response.status).toBe(403)
  expect(await response.text()).not.toContain('Private list details')
})

it('rejects malformed JSON before any mutation', async () => {
  const response = await handleShoppingSharing(new Request('https://app.example/api/shopping-sharing', {
    method: 'POST', headers: { Authorization: 'Bearer valid' }, body: '{'
  }))
  expect(response.status).toBe(400)
  expect(mockExecute).not.toHaveBeenCalled()
})

it('allows authenticated own-list signup while keeping sharing disabled', async () => {
  delete process.env.SHOPPING_LIST_SHARING_ENABLED
  const response = await handleShoppingSharing(new Request('https://app.example/api/shopping-sharing', {
    method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ action: 'provision' })
  }))
  expect(response.status).toBe(200)
  expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ uid: 'guest-uid' }), { action: 'provision' })
})

it('still rejects invitation writes when sharing is disabled', async () => {
  delete process.env.SHOPPING_LIST_SHARING_ENABLED
  const response = await handleShoppingSharing(new Request('https://app.example/api/shopping-sharing', {
    method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ action: 'invite' })
  }))
  expect(response.status).toBe(503)
  expect(mockExecute).not.toHaveBeenCalled()
})

it('passes the isolated runtime configuration through the shared Firebase safety guard', async () => {
  const previous = process.env.FRIDGE_DEMO_MODE
  process.env.FRIDGE_DEMO_MODE = 'true'
  try {
    await handleShoppingSharing(new Request('https://app.example/api/shopping-sharing', { headers: { Authorization: 'Bearer valid' } }))
    expect(mockAdminApp).toHaveBeenCalledWith(expect.objectContaining({ FRIDGE_DEMO_MODE: 'true' }))
  } finally {
    if (previous === undefined) delete process.env.FRIDGE_DEMO_MODE
    else process.env.FRIDGE_DEMO_MODE = previous
  }
})
