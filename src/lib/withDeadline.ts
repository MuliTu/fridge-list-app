/** Bound even dependencies that ignore AbortSignal; late outcomes are discarded. */
export const withDeadline = async <T>(
  work: (signal: AbortSignal) => Promise<T>, milliseconds: number, parent?: AbortSignal
): Promise<T> => {
  const controller = new AbortController()
  const abort = () => controller.abort(parent?.reason)
  parent?.addEventListener('abort', abort, { once: true })
  if (parent?.aborted) abort()
  const timer = setTimeout(() => controller.abort(new Error('Request deadline exceeded')), milliseconds)
  let rejectAborted: () => void = () => undefined
  try {
    controller.signal.throwIfAborted()
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectAborted = () => reject(controller.signal.reason ?? new Error('Request cancelled'))
      controller.signal.addEventListener('abort', rejectAborted, { once: true })
      if (controller.signal.aborted) rejectAborted()
    })
    return await Promise.race([
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted()
        return work(controller.signal)
      }),
      cancelled
    ])
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', abort)
    controller.signal.removeEventListener('abort', rejectAborted)
  }
}
