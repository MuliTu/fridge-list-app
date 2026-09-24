/** @jest-environment node */

export {}

const originalNodeEnv = process.env.NODE_ENV
const originalFirebaseEnv = {
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_DATABASE_URL: process.env.VITE_FIREBASE_DATABASE_URL,
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID
}

const clearFirebaseEnv = () => {
  delete process.env.VITE_FIREBASE_API_KEY
  delete process.env.VITE_FIREBASE_AUTH_DOMAIN
  delete process.env.VITE_FIREBASE_DATABASE_URL
  delete process.env.VITE_FIREBASE_PROJECT_ID
  delete process.env.VITE_FIREBASE_APP_ID
}

const restoreEnv = () => {
  process.env.NODE_ENV = originalNodeEnv
  Object.entries(originalFirebaseEnv).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  })
}

const mockFirebaseModules = () => {
  jest.doMock('firebase/app', () => ({ initializeApp: jest.fn((config) => ({ config })) }))
  jest.doMock('firebase/database', () => ({
    getDatabase: jest.fn(),
    ref: jest.fn((_db: unknown, path: string) => ({ path })),
    onValue: jest.fn(() => jest.fn()),
    get: jest.fn(),
    push: jest.fn(() => ({ key: 'mock-key' })),
    set: jest.fn(),
    update: jest.fn(),
    remove: jest.fn()
  }))
  jest.doMock('firebase/auth', () => ({
    getAuth: jest.fn(() => ({ currentUser: null })),
    GoogleAuthProvider: jest.fn(),
    signInWithPopup: jest.fn(),
    onAuthStateChanged: jest.fn(),
    signOut: jest.fn()
  }))
  jest.doMock('firebase/firestore', () => ({
    getFirestore: jest.fn(),
    doc: jest.fn(),
    setDoc: jest.fn(),
    getDoc: jest.fn(),
    deleteDoc: jest.fn()
  }))
  jest.doMock('../../src/lib/logger', () => ({ logger: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
}

describe('Firebase server import', () => {
  afterEach(() => {
    restoreEnv()
    jest.resetModules()
    jest.dontMock('firebase/app')
    jest.dontMock('firebase/database')
    jest.dontMock('firebase/auth')
    jest.dontMock('firebase/firestore')
    jest.dontMock('../../src/lib/logger')
  })

  it('does not throw during server rendering when browser Firebase env vars are absent', async () => {
    jest.resetModules()
    mockFirebaseModules()
    process.env.NODE_ENV = 'development'
    clearFirebaseEnv()

    await expect(import('../../src/lib/firebase')).resolves.toBeDefined()

    const { initializeApp } = await import('firebase/app')
    expect(initializeApp).toHaveBeenCalledWith({
      apiKey: 'server-render-placeholder-api-key',
      authDomain: 'server-render-placeholder.firebaseapp.com',
      databaseURL: 'https://server-render-placeholder-default-rtdb.europe-west1.firebasedatabase.app',
      projectId: 'server-render-placeholder',
      appId: 'server-render-placeholder-app-id'
    })
  })
})
