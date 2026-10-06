/** @jest-environment node */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
import { withRequestDeadline } from './requestDeadline.server'

it('bounds a stalled request before any provider call and aborts its signal', async () => {
  let signal: AbortSignal | undefined
  const response = await withRequestDeadline(new Request('http://local.test'), async (value) => {
    signal = value
    return new Promise<Response>(() => {})
  }, 10)
  expect(response.status).toBe(503)
  expect(signal?.aborted).toBe(true)
})

it('does not start work when the HTTP request is already cancelled', async () => {
  const controller = new AbortController()
  controller.abort()
  const execute = jest.fn()
  const response = await withRequestDeadline(new Request('http://local.test', { signal: controller.signal }), execute)
  expect(response.status).toBe(503)
  expect(execute).not.toHaveBeenCalled()
})

it('preserves successful responses', async () => {
  const response = new Response('ok')
  expect(await withRequestDeadline(new Request('http://local.test'), async () => response)).toBe(response)
})
