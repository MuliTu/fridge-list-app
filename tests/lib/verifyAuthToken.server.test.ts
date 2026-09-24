/** @jest-environment node */

export {}

const originalNodeEnv = process.env.NODE_ENV
const originalFirebaseProjectId = process.env.FIREBASE_PROJECT_ID
const originalViteFirebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID

describe('verifyAuthToken server import', () => {
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    if (originalFirebaseProjectId === undefined) {
      delete process.env.FIREBASE_PROJECT_ID
    } else {
      process.env.FIREBASE_PROJECT_ID = originalFirebaseProjectId
    }
    if (originalViteFirebaseProjectId === undefined) {
      delete process.env.VITE_FIREBASE_PROJECT_ID
    } else {
      process.env.VITE_FIREBASE_PROJECT_ID = originalViteFirebaseProjectId
    }
    jest.resetModules()
  })

  it('does not throw during server rendering when Firebase project env vars are absent', async () => {
    jest.resetModules()
    process.env.NODE_ENV = 'development'
    delete process.env.FIREBASE_PROJECT_ID
    delete process.env.VITE_FIREBASE_PROJECT_ID

    await expect(import('../../src/lib/verifyAuthToken')).resolves.toMatchObject({
      FIREBASE_PROJECT_ID: 'server-render-placeholder'
    })
  })
})
