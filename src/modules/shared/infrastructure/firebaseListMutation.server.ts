import '@tanstack/react-start/server-only'

import type { App } from 'firebase-admin/app'
import { withDeadline } from '../../../lib/withDeadline'
import { ApplicationError } from '../index'

type RecordNode = Record<string, unknown>
type MutationOptions = { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number }
type ListMutation<T> = (list: RecordNode) => { value: RecordNode; result: T } | undefined
export type MutateList = <T>(listId: string, mutate: ListMutation<T>, options?: MutationOptions) => Promise<T | undefined>

const readExport = async (response: Response, maxBytes?: number): Promise<unknown> => {
  if (maxBytes === undefined) return response.json()
  const reader = response.body?.getReader()
  if (!reader) throw new ApplicationError('upstream_failed', 'Firebase list response omitted its body')
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) throw new ApplicationError('invalid_input', 'Review household exceeds the size limit')
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally { await reader.cancel().catch(() => undefined) }
}

/** Optimistic list-local transaction preserving Firebase export metadata. */
export const createListMutation = (app: App, databaseUrl: string): MutateList => {
  const root = new URL(databaseUrl)
  const emulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST
  if (emulatorHost) {
    const namespace = root.searchParams.get('ns') ?? root.hostname.split('.')[0]
    root.host = emulatorHost
    root.protocol = 'http:'
    root.searchParams.set('ns', namespace)
  } else if (root.protocol !== 'https:') {
    throw new ApplicationError('not_configured', 'Firebase Realtime Database requires HTTPS')
  }

  return async <T>(listId: string, mutate: ListMutation<T>, options: MutationOptions = {}): Promise<T | undefined> =>
    withDeadline(async (signal) => {
      const token = emulatorHost ? 'owner' : (await app.options.credential?.getAccessToken())?.access_token
      if (!token) throw new ApplicationError('unavailable', 'Firebase Admin credential could not issue an access token')
      signal.throwIfAborted()
      const url = new URL(root)
      url.pathname = `/users/${encodeURIComponent(listId)}.json`
      const readUrl = new URL(url)
      readUrl.searchParams.set('format', 'export')
      const headers = { Authorization: `Bearer ${token}` }

      for (let attempt = 0; attempt < 25; attempt += 1) {
        signal.throwIfAborted()
        const response = await fetch(readUrl, {
          headers: { ...headers, 'X-Firebase-ETag': 'true' }, redirect: 'error', signal
        })
        if (!response.ok) throw new ApplicationError('upstream_failed', `Firebase list read returned HTTP ${response.status}`)
        const etag = response.headers.get('etag')
        if (!etag) throw new ApplicationError('upstream_failed', 'Firebase list response omitted an ETag')
        const current = await readExport(response, options.maxBytes)
        signal.throwIfAborted()
        const object = Array.isArray(current) ? { ...current }
          : current && typeof current === 'object' ? current as RecordNode : {}
        const change = current === null ? undefined : mutate(object)
        if (!change) return undefined
        const body = JSON.stringify(change.value)
        if (options.maxBytes !== undefined && Buffer.byteLength(body) > options.maxBytes) {
          throw new ApplicationError('invalid_input', 'Review household exceeds the size limit')
        }
        signal.throwIfAborted()
        const write = await fetch(url, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json', 'If-Match': etag },
          body, redirect: 'error', signal
        })
        await write.body?.cancel().catch(() => undefined)
        if (write.status === 412) continue
        if (!write.ok) throw new ApplicationError('upstream_failed', `Firebase list write returned HTTP ${write.status}`)
        return change.result
      }
      throw new ApplicationError('upstream_failed', 'Firebase list transaction did not converge')
    }, options.timeoutMs ?? 10_000, options.signal)
}
