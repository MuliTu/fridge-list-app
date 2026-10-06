jest.mock('./demoRuntime', () => ({
  DEMO_CLIENT_MODE: true,
  demoFirebaseConfig: { projectId: 'demo-fridge-list', databaseURL: 'http://127.0.0.1:9000?ns=demo-fridge-list-default-rtdb', apiKey: 'demo-only' }
}))
jest.mock('firebase/app', () => ({ initializeApp: jest.fn(() => ({})) }))
jest.mock('firebase/database', () => ({
  goOffline: jest.fn(),
  getDatabase: jest.fn(() => ({})), connectDatabaseEmulator: jest.fn(),
  ref: jest.fn(), onValue: jest.fn(), get: jest.fn(), push: jest.fn(), set: jest.fn(), update: jest.fn(), remove: jest.fn()
}))
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})), connectAuthEmulator: jest.fn(), GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(), signInWithEmailAndPassword: jest.fn(), onAuthStateChanged: jest.fn(), signOut: jest.fn()
}))
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})), connectFirestoreEmulator: jest.fn(),
  doc: jest.fn(), setDoc: jest.fn(), getDoc: jest.fn(), deleteDoc: jest.fn()
}))
import { initializeApp } from 'firebase/app'
import { connectDatabaseEmulator, goOffline } from 'firebase/database'
import { connectAuthEmulator, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'
import { signIn } from './firebase'

it('connects all browser SDKs to loopback before any application action', () => {
  expect(goOffline).not.toHaveBeenCalled()
  expect(initializeApp).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'demo-fridge-list' }))
  expect(connectDatabaseEmulator).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', 9000)
  expect(connectAuthEmulator).toHaveBeenCalledWith(expect.anything(), 'http://127.0.0.1:9099', { disableWarnings: true })
  expect(connectFirestoreEmulator).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', 8080)
})

it('uses actual emulator credentials for the fixed synthetic owner instead of a client bypass', () => {
  signIn()
  expect(signInWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'owner@example.test', 'local-demo-only-password')
  expect(signInWithPopup).not.toHaveBeenCalled()
})

it('permits only the fixed synthetic roles when switching demo users', async () => {
  window.history.replaceState({}, '', '/?demoUser=editor')
  signIn()
  expect(signInWithEmailAndPassword).toHaveBeenLastCalledWith(expect.anything(), 'editor@example.test', 'local-demo-only-password')
  window.history.replaceState({}, '', '/?demoUser=arbitrary')
  await expect(signIn()).rejects.toThrow('Unknown synthetic demo user')
  window.history.replaceState({}, '', '/')
})
