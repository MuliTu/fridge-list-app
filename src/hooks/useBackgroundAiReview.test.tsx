import { act, renderHook } from '@testing-library/react'
import { getBackgroundAiReviewAvailability, requestBackgroundAiReview } from '../client/api/backgroundAiReview'
import { useBackgroundAiReview } from './useBackgroundAiReview'

jest.mock('../client/api/backgroundAiReview', () => ({
  getBackgroundAiReviewAvailability: jest.fn(),
  requestBackgroundAiReview: jest.fn()
}))

const capability = jest.mocked(getBackgroundAiReviewAvailability)
const request = jest.mocked(requestBackgroundAiReview)
const empty = { kind: 'completed' as const, result: { mode: 'list_review' as const, duplicates: [], renames: [] } }
const findings = {
  kind: 'completed' as const,
  result: { mode: 'list_review' as const, duplicates: [], renames: [{
    key: 'a', currentName: 'Milkk', suggestedName: 'Milk', reason: 'Typo'
  }] }
}
const state = (item: string, listId = 'first', actor = 'uid') => ({
  actor, listId, ready: true, language: 'en' as const,
  entries: [{ key: 'a', item, bought: false, category: 'Other', added_at: '' }]
})
const flush = async (ms = 0) => act(async () => {
  await jest.advanceTimersByTimeAsync(ms)
})

beforeEach(() => {
  jest.useFakeTimers()
  jest.resetAllMocks()
  capability.mockResolvedValue({ synthetic: true })
})
afterEach(() => jest.useRealTimers())

it('waits for production opt-in, coalesces edits, and consumes a notification without another call', async () => {
  capability.mockResolvedValue({ synthetic: false })
  request.mockResolvedValue(findings)
  const { result, rerender } = renderHook(useBackgroundAiReview, { initialProps: state('Milk') })
  await flush()
  expect(capability).toHaveBeenCalledWith('first', 'uid', expect.any(AbortSignal))
  expect(result.current.offer).toBe(true)
  await flush(3000)
  expect(request).not.toHaveBeenCalled()
  act(() => result.current.enable())
  rerender(state('Mil'))
  await flush(1000)
  rerender(state('Milkk'))
  await flush(2500)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith('first', result.current.snapshot, 'en', 'uid', expect.any(AbortSignal))
  expect(result.current.notification?.result).toEqual(findings.result)
  act(() => result.current.markRead())
  rerender(state('Milkk'))
  await flush(3000)
  expect(result.current.notification).toBeNull()
  expect(request).toHaveBeenCalledTimes(1)
})

it('schedules the next changed snapshot after a pending review and ignores stale results', async () => {
  let complete!: (response: typeof findings) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
    .mockResolvedValue(empty)
  const { result, rerender } = renderHook(useBackgroundAiReview, { initialProps: state('Milkk') })
  await flush()
  await flush(2500)
  rerender(state('Bread'))
  await flush(3000)
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => { complete(findings) })
  expect(result.current.notification).toBeNull()
  await flush(2500)
  expect(request).toHaveBeenCalledTimes(2)
  expect(result.current.notification).toBeNull()
})

it('limits backoff to one retry and cancels it on an identity change', async () => {
  request.mockResolvedValue({ kind: 'rate_limited', seconds: 2 })
  const { result, rerender } = renderHook(useBackgroundAiReview, { initialProps: state('Milkk') })
  await flush()
  await flush(2500)
  await flush(2250)
  expect(request).toHaveBeenCalledTimes(2)
  expect(request).toHaveBeenNthCalledWith(2, 'first', result.current.snapshot, 'en', 'uid', expect.any(AbortSignal))
  expect(result.current.failed).toBe(true)
  act(() => result.current.retry())
  await flush(2500)
  rerender(state('Milkk', 'first', 'another-uid'))
  await flush()
  expect(capability).toHaveBeenLastCalledWith('first', 'another-uid', expect.any(AbortSignal))
  await flush(2250)
  expect(request).toHaveBeenCalledTimes(3)
  expect(result.current.failed).toBe(false)
})

it('releases a stalled attempt, exposes retry, and recovers a newer snapshot', async () => {
  request.mockImplementationOnce(() => new Promise(() => undefined)).mockResolvedValue(empty)
  const { result, rerender } = renderHook(useBackgroundAiReview, { initialProps: state('Milk') })
  await flush()
  await flush(2500)
  await flush(45_000)
  expect(result.current.running).toBe(false)
  expect(result.current.failed).toBe(true)
  rerender(state('Bread'))
  await flush(2500)
  expect(request).toHaveBeenCalledTimes(2)
  expect(result.current.failed).toBe(false)
})

it('releases a stalled call immediately on a scope switch even when the transport ignores cancellation', async () => {
  request.mockImplementationOnce(() => new Promise(() => undefined)).mockResolvedValue(empty)
  const { result, rerender } = renderHook(useBackgroundAiReview, { initialProps: state('Milk') })
  await flush()
  await flush(2500)
  rerender(state('Bread', 'second', 'another-user'))
  await flush()
  await flush(2500)
  expect(request).toHaveBeenCalledTimes(2)
  expect(result.current.running).toBe(false)
})
