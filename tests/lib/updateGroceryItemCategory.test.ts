// Focused unit test for the category-reassign helper used by drag-and-drop between
// category sections (and the "move to category" picker). The whole firebase SDK is
// mocked at the module boundary so this never touches the real n8n-vocal-2-db project.

jest.mock('firebase/app', () => ({ initializeApp: jest.fn(() => ({})) }))
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signOut: jest.fn()
}))
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(),
  deleteDoc: jest.fn()
}))

const mockUpdate = jest.fn(() => Promise.resolve())
const mockRef = jest.fn((_db: unknown, path: string) => ({ path }))
jest.mock('firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: (...args: [unknown, string]) => mockRef(...args),
  onValue: jest.fn(),
  get: jest.fn(),
  push: jest.fn(),
  set: jest.fn(),
  update: (...args: unknown[]) => mockUpdate(...(args as [])),
  remove: jest.fn()
}))
jest.mock('../../src/lib/logger', () => ({ logger: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

import { createListApi } from '../../src/lib/firebase'

describe('updateGroceryItemCategory', () => {
  const api = createListApi('owner@example.com')

  beforeEach(() => {
    ;(global as any).fetch = jest.fn(() => Promise.resolve())
    mockUpdate.mockClear()
    mockRef.mockClear()
  })

  it('writes the new category to the correct list-scoped /groceries item path with modified metadata', () => {
    api.updateGroceryItemCategory('item-1', 'ירקות ופירות', { email: 'editor@example.com' })

    expect(mockRef).toHaveBeenCalledWith(expect.anything(), 'users/owner@example_com/groceries/item-1')
    expect(mockUpdate).toHaveBeenCalledTimes(1)

    const [refArg, payload] = mockUpdate.mock.calls[0] as unknown as [{ path: string }, Record<string, unknown>]
    expect(refArg.path).toBe('users/owner@example_com/groceries/item-1')
    expect(payload.category).toBe('ירקות ופירות')
    expect(payload.modified_by).toBe('editor@example.com')
    expect(typeof payload.modified_at).toBe('string')
  })

  it('stamps modified_by as null when no user is provided (e.g. anonymous)', () => {
    api.updateGroceryItemCategory('item-2', 'מוצרי חלב')

    const [, payload] = mockUpdate.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(payload.category).toBe('מוצרי חלב')
    expect(payload.modified_by).toBeNull()
  })

  it('does not mutate any field other than category and the modified_* stamps', () => {
    api.updateGroceryItemCategory('item-3', 'קפואים', { email: 'a@b.com' })

    const [, payload] = mockUpdate.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(Object.keys(payload).sort()).toEqual(['category', 'modified_at', 'modified_by'])
  })
})
