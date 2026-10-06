/** @jest-environment node */
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

import { goOffline, getDatabase } from 'firebase/database'
import './firebase'

it('keeps browser RTDB offline during server rendering', () => {
  expect(goOffline).toHaveBeenCalledTimes(1)
  expect(goOffline).toHaveBeenCalledWith((getDatabase as jest.Mock).mock.results[0].value)
})
