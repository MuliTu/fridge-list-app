/**
 * Covers getAuthHeaders() (internal to firebase.ts) via its 4 callers — categorizeItem,
 * scanReceipt, scanReceiptFromUrl, submitFeedback — which now attach
 * `Authorization: Bearer <idToken>` to their same-origin server-route calls (see
 * src/lib/verifyAuthToken.ts for the server side of this). Firebase is mocked at the
 * module boundary per .claude/skills/senior-qa-jest — this must never touch the real
 * n8n-vocal-2-db project. `auth.currentUser` is exposed as a getter over a mutable
 * module-level variable so each test can simulate signed-in/signed-out/getIdToken-
 * failure states without re-mocking the whole module.
 */
jest.mock('firebase/app', () => ({ initializeApp: jest.fn() }))
jest.mock('firebase/database', () => ({
  getDatabase: jest.fn(),
  ref: jest.fn((_db: unknown, path: string) => ({ path })),
  onValue: jest.fn(() => jest.fn()),
  get: jest.fn(),
  push: jest.fn(() => ({ key: 'mock-key' })),
  set: jest.fn(),
  update: jest.fn(),
  remove: jest.fn()
}))

let mockCurrentUser: { getIdToken: jest.Mock } | null = null
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    get currentUser() {
      return mockCurrentUser
    }
  })),
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signOut: jest.fn()
}))
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  doc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(),
  deleteDoc: jest.fn()
}))
jest.mock('./logger', () => ({ logger: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

import { categorizeItem, scanReceipt, scanReceiptFromUrl, submitFeedback } from './firebase'

// Pulls out the single fetch call made to `urlSubstring` (ignoring the fire-and-forget
// /api/client-log calls logClientAction makes alongside some of these).
const callTo = (mockFetch: jest.Mock, urlSubstring: string) => {
  const call = mockFetch.mock.calls.find(([url]) => String(url).includes(urlSubstring))
  if (!call) throw new Error(`no fetch call found for ${urlSubstring}`)
  return call
}

describe('auth header attachment on server-route calls', () => {
  beforeEach(() => {
    mockCurrentUser = null
    ;(globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [], store_name: null, total: null, error: false })
    })
  })

  describe('categorizeItem', () => {
    it('attaches Authorization: Bearer <token> when a user is signed in', async () => {
      mockCurrentUser = { getIdToken: jest.fn().mockResolvedValue('real-id-token') }
      await categorizeItem('חלב')
      const [, options] = callTo(globalThis.fetch as jest.Mock, '/api/categorize-item')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer real-id-token')
    })

    it('sends no Authorization header (and does not throw) when no user is signed in', async () => {
      mockCurrentUser = null
      await expect(categorizeItem('חלב')).resolves.toBeDefined()
      const [, options] = callTo(globalThis.fetch as jest.Mock, '/api/categorize-item')
      expect((options.headers as Record<string, string>).Authorization).toBeUndefined()
    })

    it('degrades gracefully (no Authorization header, no throw) when getIdToken() itself rejects', async () => {
      mockCurrentUser = { getIdToken: jest.fn().mockRejectedValue(new Error('token refresh failed')) }
      await expect(categorizeItem('חלב')).resolves.toBeDefined()
      const [, options] = callTo(globalThis.fetch as jest.Mock, '/api/categorize-item')
      expect((options.headers as Record<string, string>).Authorization).toBeUndefined()
    })
  })

  describe('scanReceipt', () => {
    it('attaches Authorization: Bearer <token> when a user is signed in', async () => {
      mockCurrentUser = { getIdToken: jest.fn().mockResolvedValue('real-id-token') }
      const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' }) as Blob & { type: string }
      await scanReceipt(blob)
      const [, options] = callTo(globalThis.fetch as jest.Mock, '/api/scan-receipt')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer real-id-token')
    })

    it('sends no Authorization header when no user is signed in', async () => {
      mockCurrentUser = null
      const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' }) as Blob & { type: string }
      await scanReceipt(blob)
      const [, options] = callTo(globalThis.fetch as jest.Mock, '/api/scan-receipt')
      expect((options.headers as Record<string, string>).Authorization).toBeUndefined()
    })
  })

  describe('scanReceiptFromUrl', () => {
    it('attaches Authorization: Bearer <token> when a user is signed in', async () => {
      mockCurrentUser = { getIdToken: jest.fn().mockResolvedValue('real-id-token') }
      await scanReceiptFromUrl('https://www.shufersal.co.il/receipt/123')
      const [, options] = callTo(globalThis.fetch as jest.Mock, '/api/scan-receipt-url')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer real-id-token')
    })

    it('sends no Authorization header when no user is signed in', async () => {
      mockCurrentUser = null
      await scanReceiptFromUrl('https://www.shufersal.co.il/receipt/123')
      const [, options] = callTo(globalThis.fetch as jest.Mock, '/api/scan-receipt-url')
      expect((options.headers as Record<string, string>).Authorization).toBeUndefined()
    })
  })

  describe('submitFeedback', () => {
    it('attaches Authorization: Bearer <token> when a user is signed in', async () => {
      mockCurrentUser = { getIdToken: jest.fn().mockResolvedValue('real-id-token') }
      await submitFeedback({ request: 'add dark mode' })
      const [, options] = callTo(globalThis.fetch as jest.Mock, '/api/submit-feedback')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer real-id-token')
    })

    it('sends no Authorization header when no user is signed in', async () => {
      mockCurrentUser = null
      await submitFeedback({ request: 'add dark mode' })
      const [, options] = callTo(globalThis.fetch as jest.Mock, '/api/submit-feedback')
      expect((options.headers as Record<string, string>).Authorization).toBeUndefined()
    })
  })
})
