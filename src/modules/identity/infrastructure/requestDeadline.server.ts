import '@tanstack/react-start/server-only'
import { ApplicationError } from '../../shared'
import { toHttpErrorResponse } from '../../shared/server'

/** Includes authentication, body parsing, inventory reads and model execution. */
export const withRequestDeadline = async (
  request: Request,
  execute: (signal: AbortSignal) => Promise<Response>,
  timeoutMs = 30_000
): Promise<Response> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) throw new TypeError('Invalid deadline')
  const controller = new AbortController()
  const cancel = () => controller.abort()
  request.signal.addEventListener('abort', cancel, { once: true })
  if (request.signal.aborted) controller.abort()
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  try {
    const interrupted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new ApplicationError('unavailable', 'Recipe request timed out or was cancelled'))
      controller.signal.addEventListener('abort', onAbort, { once: true })
      if (controller.signal.aborted) onAbort()
      timer = setTimeout(cancel, timeoutMs)
    })
    if (controller.signal.aborted) return await interrupted
    return await Promise.race([execute(controller.signal), interrupted])
  } catch (error) {
    return toHttpErrorResponse(error)
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener('abort', cancel)
    if (onAbort) controller.signal.removeEventListener('abort', onAbort)
  }
}
