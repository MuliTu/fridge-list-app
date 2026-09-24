// Unit tests for the multi-tenant list (household) primitives in firebase.ts:
// ensureOwnList, approvePendingInvites, inviteToList, removeListMember,
// renameOwnList, sanitizeEmailKey. A list is identified by its owner's email (no
// generated list ID) — these are exactly the kind of multi-path update() shape
// that's worth pinning down, since a wrong path here silently corrupts the
// invites/memberOf mirror rather than throwing. The whole firebase SDK is mocked
// at the module boundary so this never touches the real n8n-vocal-2-db project.

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
const mockSet = jest.fn((..._args: unknown[]) => Promise.resolve())
const mockRef = jest.fn((_db: unknown, path?: string) => ({ path }))
const mockGet = jest.fn()

jest.mock('firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: (db: unknown, path?: string) => mockRef(db, path),
  onValue: jest.fn(),
  get: (...args: unknown[]) => mockGet(...args),
  push: jest.fn(),
  set: (...args: unknown[]) => mockSet(...args),
  update: (...args: unknown[]) => mockUpdate(...(args as [])),
  remove: jest.fn()
}))
jest.mock('../../src/lib/logger', () => ({ logger: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

import {
  approvePendingInvites,
  ensureOwnList,
  inviteToList,
  removeListMember,
  renameOwnList,
  sanitizeEmailKey
} from '../../src/lib/firebase'

// logClientAction fires a fire-and-forget fetch to /api/client-log on every write —
// stub it globally so every describe block below doesn't need its own.
beforeEach(() => {
  ;(global as any).fetch = jest.fn(() => Promise.resolve())
})

describe('sanitizeEmailKey', () => {
  it('lowercases, trims, and replaces Firebase-illegal key characters', () => {
    expect(sanitizeEmailKey('  Muli.Turiel@Gmail.com  ')).toBe('muli_turiel@gmail_com')
  })

  it('is idempotent on an already-sanitized key', () => {
    const once = sanitizeEmailKey('Bob@Example.com')
    expect(sanitizeEmailKey(once)).toBe(once)
  })
})

describe('ensureOwnList', () => {
  beforeEach(() => jest.clearAllMocks())

  it('provisions a default name when this user has never had one before', async () => {
    mockGet.mockResolvedValue({ exists: () => false })

    const name = await ensureOwnList('bob@example.com', 'Bob')

    expect(name).toBe('הרשימה של Bob')
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/bob@example_com/name' }), 'הרשימה של Bob')
  })

  it('does nothing and returns the existing name if already provisioned', async () => {
    mockGet.mockResolvedValue({ exists: () => true, val: () => 'Existing List' })

    const name = await ensureOwnList('bob@example.com', 'Bob')

    expect(name).toBe('Existing List')
    expect(mockSet).not.toHaveBeenCalled()
  })
})

describe('inviteToList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGet.mockResolvedValue({ val: () => 'Turiel Home List' })
    ;(global as any).fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ error: false }) }))
  })

  it('writes a pending invite under the owner (with the real email) and a bare-enum mirror under the invitee', async () => {
    await inviteToList('dad@example.com', 'Mom@Example.com', 'dad@example.com')

    const [, updates] = mockUpdate.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(updates['users/dad@example_com/invites/mom@example_com']).toEqual({
      email: 'mom@example.com',
      status: 'pending'
    })
    expect(updates['users/mom@example_com/memberOf/dad@example_com']).toBe('pending')
  })

  it('sends a best-effort invite email naming the owner\'s list', async () => {
    await inviteToList('dad@example.com', 'mom@example.com', 'dad@example.com')

    expect(fetch).toHaveBeenCalledWith(
      '/api/send-invite-email',
      expect.objectContaining({
        body: JSON.stringify({ to: 'mom@example.com', invitedBy: 'dad@example.com', listName: 'Turiel Home List' })
      })
    )
  })
})

describe('removeListMember', () => {
  beforeEach(() => jest.clearAllMocks())

  it('nulls both the owner-side invite and the invitee-side mirror', async () => {
    await removeListMember('dad@example.com', 'mom@example.com')

    const [, updates] = mockUpdate.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(updates['users/dad@example_com/invites/mom@example_com']).toBeNull()
    expect(updates['users/mom@example_com/memberOf/dad@example_com']).toBeNull()
  })
})

describe('renameOwnList', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sets this owner\'s list name directly', () => {
    renameOwnList('dad@example.com', 'New Name')

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/dad@example_com/name' }), 'New Name')
  })
})

describe('approvePendingInvites', () => {
  beforeEach(() => jest.clearAllMocks())

  it('flips every pending memberOf entry to approved on both sides', async () => {
    mockGet.mockResolvedValue({ val: () => ({ 'dad@example_com': 'pending', 'aunt@example_com': 'approved' }) })

    await approvePendingInvites('mom@example.com')

    const [, updates] = mockUpdate.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    // Only the status sub-field on the owner's side (its value is an object), the
    // whole value on the invitee's side (a bare enum) — and the already-approved
    // aunt entry is left untouched entirely.
    expect(updates['users/dad@example_com/invites/mom@example_com/status']).toBe('approved')
    expect(updates['users/mom@example_com/memberOf/dad@example_com']).toBe('approved')
    expect(Object.keys(updates)).not.toContain('users/aunt@example_com/invites/mom@example_com/status')
  })

  it('is a no-op when nothing is pending', async () => {
    mockGet.mockResolvedValue({ val: () => ({ 'dad@example_com': 'approved' }) })

    await approvePendingInvites('mom@example.com')

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
