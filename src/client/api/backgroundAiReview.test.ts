/** @jest-environment node */
import { webcrypto } from 'node:crypto'
import { applyBackgroundAiReview, getBackgroundAiReviewAvailability, requestBackgroundAiReview } from './backgroundAiReview'

let mockCurrentUser: { uid: string; getIdToken: jest.Mock } | null
jest.mock('firebase/app', () => ({ initializeApp: jest.fn() }))
jest.mock('firebase/auth', () => ({
  getAuth: () => ({ get currentUser() { return mockCurrentUser } }),
  GoogleAuthProvider: jest.fn()
}))
jest.mock('firebase/database', () => ({ getDatabase: jest.fn(), goOffline: jest.fn(), ref: jest.fn() }))
jest.mock('firebase/firestore', () => ({ getFirestore: jest.fn() }))

const snapshot = JSON.stringify([{ key: 'a', item: 'Milk', bought: false, list_name: null }])
const actorUid = 'consenting-actor'
const operationId = '61a46801-6bd9-43c0-8c6d-c7d3793e53ba'
const originalFetch = global.fetch
beforeEach(() => {
  jest.resetAllMocks()
  Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true })
  mockCurrentUser = { uid: actorUid, getIdToken: jest.fn().mockResolvedValue('actor-token') }
  global.fetch = jest.fn()
})
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); jest.restoreAllMocks() })

it('cancels while awaiting an actor-bound token and never dispatches a late token', async () => {
  let complete!: (token: string) => void
  mockCurrentUser!.getIdToken.mockImplementation(() => new Promise((resolve) => { complete = resolve }))
  const controller = new AbortController()
  const pending = applyBackgroundAiReview('list-a', snapshot, ['a'], [], {
    actorUid, operationId, signal: controller.signal
  })
  const assertion = expect(pending).rejects.toThrow()
  // WebCrypto hashing uses the native async task queue.
  while (!complete) await new Promise((resolve) => setImmediate(resolve))
  controller.abort()
  await assertion
  complete('late-token')
  await new Promise((resolve) => setImmediate(resolve))
  expect(fetch).not.toHaveBeenCalled()
})

it('uses the captured actor token for capability and sends no request for a replacement account', async () => {
  const signal = new AbortController().signal
  jest.mocked(fetch).mockResolvedValue(Response.json({ enabled: true, synthetic: false }))
  await expect(getBackgroundAiReviewAvailability('list', actorUid, signal)).resolves.toEqual({ synthetic: false })
  expect(fetch).toHaveBeenCalledWith('/api/lists/list/background-ai-review', expect.objectContaining({
    method: 'GET', headers: { Authorization: 'Bearer actor-token' }
  }))
  mockCurrentUser = { uid: 'replacement', getIdToken: jest.fn().mockResolvedValue('replacement-token') }
  await expect(getBackgroundAiReviewAvailability('list', actorUid, signal)).rejects.toThrow('Account changed')
  expect(mockCurrentUser.getIdToken).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('does not send analysis when the account switches during snapshot hashing', async () => {
  let completeDigest!: (bytes: ArrayBuffer) => void
  const digestStarted = new Promise<void>((started) => {
    jest.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise((resolve) => {
      completeDigest = resolve
      started()
    }))
  })
  const controller = new AbortController()
  const pending = requestBackgroundAiReview('list', snapshot, 'en', actorUid, controller.signal)
  await digestStarted
  mockCurrentUser = { uid: 'replacement', getIdToken: jest.fn().mockResolvedValue('replacement-token') }
  completeDigest(new ArrayBuffer(32))
  await expect(pending).rejects.toThrow('Account changed')
  expect(controller.signal.aborted).toBe(false)
  expect(mockCurrentUser.getIdToken).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('discards an analysis token when Firebase switches accounts during acquisition', async () => {
  jest.spyOn(crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
  let completeToken!: (token: string) => void
  const tokenStarted = new Promise<void>((started) => {
    mockCurrentUser!.getIdToken.mockImplementation(() => new Promise((resolve) => {
      completeToken = resolve
      started()
    }))
  })
  const controller = new AbortController()
  const pending = requestBackgroundAiReview('list', snapshot, 'en', actorUid, controller.signal)
  await tokenStarted
  mockCurrentUser = { uid: 'replacement', getIdToken: jest.fn().mockResolvedValue('replacement-token') }
  completeToken('actor-token')
  await expect(pending).rejects.toThrow('Account changed')
  expect(controller.signal.aborted).toBe(false)
  expect(mockCurrentUser.getIdToken).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('does not dispatch a rate-limited retry after the account switches', async () => {
  jest.spyOn(crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
  jest.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '2' } }))
  const controller = new AbortController()
  await expect(requestBackgroundAiReview('list', snapshot, 'en', actorUid, controller.signal))
    .resolves.toEqual({ kind: 'rate_limited', seconds: 2 })
  mockCurrentUser = { uid: 'replacement', getIdToken: jest.fn().mockResolvedValue('replacement-token') }
  await expect(requestBackgroundAiReview('list', snapshot, 'en', actorUid, controller.signal))
    .rejects.toThrow('Account changed')
  expect(controller.signal.aborted).toBe(false)
  expect(mockCurrentUser.getIdToken).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('bounds analysis across stalled token acquisition', async () => {
  jest.useFakeTimers()
  jest.spyOn(crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
  mockCurrentUser!.getIdToken.mockImplementation(() => new Promise(() => undefined))
  const pending = requestBackgroundAiReview('list', snapshot, 'en', actorUid, new AbortController().signal)
  const assertion = expect(pending).rejects.toThrow('Request deadline exceeded')
  await jest.advanceTimersByTimeAsync(45_000)
  await assertion
  expect(fetch).not.toHaveBeenCalled()
})

it('bounds an HTTP transport that ignores cancellation', async () => {
  jest.useFakeTimers()
  jest.spyOn(crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
  jest.mocked(fetch).mockImplementation(() => new Promise(() => undefined))
  const pending = requestBackgroundAiReview('list', snapshot, 'en', actorUid, new AbortController().signal)
  const assertion = expect(pending).rejects.toThrow('Request deadline exceeded')
  await jest.advanceTimersByTimeAsync(45_000)
  await assertion
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith('/api/lists/list/background-ai-review', expect.objectContaining({
    method: 'POST',
    headers: { Authorization: 'Bearer actor-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: '0'.repeat(64), language: 'en' })
  }))
  expect(jest.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true)
})
