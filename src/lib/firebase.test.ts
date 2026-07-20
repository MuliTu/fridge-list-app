/**
 * Covers getAuthHeaders() (internal to firebase.ts) via its 5 callers — categorizeItem,
 * scanReceipt, scanReceiptFromUrl, submitFeedback, getReleases — which now attach
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

import { push, update } from 'firebase/database'
import { categorizeItem, createListApi, getReleases, scanReceipt, scanReceiptFromUrl, submitFeedback } from './firebase'
import { logger } from './logger'

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

  describe('getReleases', () => {
    it('attaches Authorization: Bearer <token> when a user is signed in', async () => {
      mockCurrentUser = { getIdToken: jest.fn().mockResolvedValue('real-id-token') }
      await getReleases()
      const [, options] = callTo(globalThis.fetch as jest.Mock, '/api/releases')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer real-id-token')
    })

    it('sends no Authorization header (and does not throw) when no user is signed in', async () => {
      mockCurrentUser = null
      await expect(getReleases()).resolves.toBeDefined()
      const [, options] = callTo(globalThis.fetch as jest.Mock, '/api/releases')
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

describe('grocery item quantity/unit persistence', () => {
  const listApi = createListApi('owner@example.com')

  beforeEach(() => {
    ;(push as jest.Mock).mockClear()
    ;(update as jest.Mock).mockClear()
  })

  describe('addGroceryItem', () => {
    it('writes quantity/unit when provided', () => {
      listApi.addGroceryItem({ name: 'עגבניות', category: 'ירקות', quantity: 2, unit: 'ק"ג' }, null)
      const [, data] = (push as jest.Mock).mock.calls[0]
      expect(data.quantity).toBe(2)
      expect(data.unit).toBe('ק"ג')
    })

    it('writes null quantity/unit when omitted, rather than undefined', () => {
      listApi.addGroceryItem({ name: 'לחם', category: 'מאפים' }, null)
      const [, data] = (push as jest.Mock).mock.calls[0]
      expect(data.quantity).toBeNull()
      expect(data.unit).toBeNull()
    })
  })

  describe('saveItemDetails', () => {
    it('writes quantity/unit alongside the other fields', async () => {
      await listApi.saveItemDetails('item-1', { note: null, quantity: 5, unit: 'יח\'' })
      const [, fields] = (update as jest.Mock).mock.calls[0]
      expect(fields.quantity).toBe(5)
      expect(fields.unit).toBe('יח\'')
    })

    it('clears quantity/unit back to null when omitted (edit-to-remove)', async () => {
      await listApi.saveItemDetails('item-1', { note: null })
      const [, fields] = (update as jest.Mock).mock.calls[0]
      expect(fields.quantity).toBeNull()
      expect(fields.unit).toBeNull()
    })
  })
})

/**
 * Append-only purchase-event log (see PurchaseEvent in ../types) — setBought's new
 * side effect. Source is the bought checkbox only (false -> true transitions), never
 * receipts (see the addPurchasedGroceryItem/applyReceiptReconciliation comments in
 * firebase.ts for that scoping decision) and never the uncheck direction. A failed
 * event-log write must never block or throw out of the actual `bought` write.
 */
describe('setBought / purchase history log', () => {
  const listApi = createListApi('owner@example.com')
  const user = { email: 'user@example.com' }
  const baseEntry = {
    key: 'item-1',
    item: 'חלב',
    category: 'מוצרי חלב',
    bought: false,
    quantity: 2,
    unit: 'ליטר'
  }

  const purchaseHistoryCall = () =>
    (push as jest.Mock).mock.calls.find(([refArg]) => String(refArg.path).includes('purchaseHistory'))

  beforeEach(() => {
    ;(push as jest.Mock).mockReset()
    ;(push as jest.Mock).mockImplementation(() => ({ key: 'mock-key' }))
    ;(update as jest.Mock).mockClear()
    ;(logger.warn as jest.Mock).mockClear()
  })

  it('appends a purchase event with the right shape on a false -> true transition', async () => {
    await listApi.setBought(baseEntry, true, user)

    const call = purchaseHistoryCall()
    expect(call).toBeDefined()
    const [, event] = call!
    expect(event).toEqual({
      itemName: 'חלב',
      category: 'מוצרי חלב',
      quantity: 2,
      unit: 'ליטר',
      purchasedAt: expect.any(String),
      purchasedBy: 'user@example.com'
    })
    // the bought write itself still happens, unaffected by the new side effect
    expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bought: true }))
  })

  it('falls back to null quantity/unit/purchasedBy when absent, never undefined', async () => {
    await listApi.setBought({ ...baseEntry, quantity: undefined as any, unit: undefined as any }, true, undefined)
    const [, event] = purchaseHistoryCall()!
    expect(event.quantity).toBeNull()
    expect(event.unit).toBeNull()
    expect(event.purchasedBy).toBeNull()
  })

  it('does NOT append a purchase event on a true -> false transition (unchecking)', async () => {
    await listApi.setBought({ ...baseEntry, bought: true }, false, user)
    expect(purchaseHistoryCall()).toBeUndefined()
    expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bought: false }))
  })

  it('does not throw or block the bought write when the event-log write rejects', async () => {
    ;(push as jest.Mock).mockImplementation((refArg: any) =>
      String(refArg.path).includes('purchaseHistory') ? Promise.reject(new Error('network error')) : { key: 'mock-key' }
    )

    let thrown: unknown = null
    try {
      await listApi.setBought(baseEntry, true, user)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeNull()
    expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bought: true }))
  })

  it('does not throw when push() itself throws synchronously for the event log', async () => {
    ;(push as jest.Mock).mockImplementation((refArg: any) => {
      if (String(refArg.path).includes('purchaseHistory')) throw new Error('sync failure')
      return { key: 'mock-key' }
    })

    let thrown: unknown = null
    try {
      await listApi.setBought(baseEntry, true, user)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeNull()
    expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bought: true }))
  })
})
