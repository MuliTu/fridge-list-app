/** @jest-environment node */
import { withDeadline } from './withDeadline'

it('does not start work or leak a rejection when the parent is already aborted', async () => {
  const work = jest.fn(async () => 1)
  await expect(withDeadline(work, 100, AbortSignal.abort())).rejects.toThrow()
  await new Promise((resolve) => setImmediate(resolve))
  expect(work).not.toHaveBeenCalled()
})

it('owns synchronous work failures and removes timers/listeners', async () => {
  jest.useFakeTimers()
  try {
    const controller = new AbortController()
    const work = () => { throw new Error('Synchronous dependency failure') }
    await expect(withDeadline(work, 100, controller.signal)).rejects.toThrow('Synchronous dependency failure')
    controller.abort()
    await jest.advanceTimersByTimeAsync(100)
    expect(jest.getTimerCount()).toBe(0)
  } finally { jest.useRealTimers() }
})

it('handles a synchronous abort followed by a synchronous work failure', async () => {
  const controller = new AbortController()
  const work = () => {
    controller.abort()
    throw new Error('Synchronous dependency failure')
  }
  await expect(withDeadline(work, 100, controller.signal)).rejects.toThrow()
  await new Promise((resolve) => setImmediate(resolve))
})
