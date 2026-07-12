// Unit tests for the multi-tenant list (household) primitives in firebase.ts:
// createList, addListMember, removeListMember, renameList, deleteList,
// sanitizeEmailKey. These are exactly the kind of multi-path update() shape that's
// worth pinning down — a wrong path here silently corrupts the reverse index rather
// than throwing. The whole firebase SDK is mocked at the module boundary so this
// never touches the real n8n-vocal-2-db project.

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
const mockRef = jest.fn((_db: unknown, path?: string) => ({ path }))
const mockGet = jest.fn()
let pushCounter = 0
const mockPush = jest.fn(() => ({ key: `pushed-${++pushCounter}` }))

jest.mock('firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: (db: unknown, path?: string) => mockRef(db, path),
  onValue: jest.fn(),
  get: (...args: unknown[]) => mockGet(...args),
  push: (..._args: unknown[]) => mockPush(),
  set: jest.fn(),
  update: (...args: unknown[]) => mockUpdate(...(args as [])),
  remove: jest.fn()
}))
jest.mock('./logger', () => ({ logger: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

import { addListMember, createList, deleteList, removeListMember, renameList, sanitizeEmailKey } from './firebase'

describe('sanitizeEmailKey', () => {
  it('lowercases, trims, and replaces Firebase-illegal key characters', () => {
    expect(sanitizeEmailKey('  Muli.Turiel@Gmail.com  ')).toBe('muli_turiel@gmail_com')
  })
})

describe('createList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    pushCounter = 0
    ;(global as any).fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ error: false }) }))
  })

  it('creates the list with owner as its first member and mirrors it into the reverse index', async () => {
    const listId = await createList('Turiel Home List', 'muli.turiel@gmail.com')

    expect(listId).toBe('pushed-1')
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const [refArg, updates] = mockUpdate.mock.calls[0] as unknown as [{ path?: string }, Record<string, unknown>]
    expect(refArg.path).toBeUndefined() // update(ref(db)) — root-level multi-path update

    const listEntry = updates['lists/pushed-1'] as Record<string, unknown>
    expect(listEntry.name).toBe('Turiel Home List')
    expect(listEntry.owner).toBe('muli.turiel@gmail.com')
    expect(listEntry.members).toEqual({ 'muli_turiel@gmail_com': 'muli.turiel@gmail.com' })

    expect(updates['users/muli_turiel@gmail_com/lists/pushed-1']).toEqual({
      name: 'Turiel Home List',
      owner: 'muli.turiel@gmail.com'
    })
  })
})

describe('addListMember / removeListMember', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global as any).fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ error: false }) }))
  })

  it('grants access by writing both the membership path and the invitee reverse index', async () => {
    await addListMember('list-1', 'Turiel Home List', 'muli.turiel@gmail.com', 'Mom@Example.com', 'muli.turiel@gmail.com')

    const [, updates] = mockUpdate.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(updates['lists/list-1/members/mom@example_com']).toBe('mom@example.com')
    expect(updates['users/mom@example_com/lists/list-1']).toEqual({
      name: 'Turiel Home List',
      owner: 'muli.turiel@gmail.com'
    })
  })

  it('sends a best-effort invite email after the membership write, including the list name', async () => {
    await addListMember('list-1', 'Turiel Home List', 'muli.turiel@gmail.com', 'mom@example.com', 'dad@example.com')

    expect(fetch).toHaveBeenCalledWith(
      '/api/send-invite-email',
      expect.objectContaining({
        body: JSON.stringify({ to: 'mom@example.com', invitedBy: 'dad@example.com', listName: 'Turiel Home List' })
      })
    )
  })

  it('revokes access by nulling both the membership path and the reverse index', async () => {
    await removeListMember('list-1', 'mom@example.com')

    const [, updates] = mockUpdate.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(updates['lists/list-1/members/mom@example_com']).toBeNull()
    expect(updates['users/mom@example_com/lists/list-1']).toBeNull()
  })
})

describe('renameList / deleteList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGet.mockResolvedValue({ val: () => ({ 'dad@example_com': 'dad@example.com', 'mom@example_com': 'mom@example.com' }) })
  })

  it('renameList fans the new name out to the list and every member reverse-index entry', async () => {
    await renameList('list-1', 'New Name')

    const [, updates] = mockUpdate.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(updates['lists/list-1/name']).toBe('New Name')
    expect(updates['users/dad@example_com/lists/list-1/name']).toBe('New Name')
    expect(updates['users/mom@example_com/lists/list-1/name']).toBe('New Name')
  })

  it('deleteList nulls the whole list and every member reverse-index entry', async () => {
    await deleteList('list-1')

    const [, updates] = mockUpdate.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(updates['lists/list-1']).toBeNull()
    expect(updates['users/dad@example_com/lists/list-1']).toBeNull()
    expect(updates['users/mom@example_com/lists/list-1']).toBeNull()
  })
})
