import { withDeadline } from '../../lib/withDeadline'
import { getActorIdToken } from '../../lib/firebase'
import { aiListReviewResultSchema, type AiListReviewResult } from '../../modules/ai'

type ReviewResponse =
  | { kind: 'completed'; result: AiListReviewResult }
  | { kind: 'rate_limited'; seconds: number }
  | { kind: 'disabled' | 'stale' | 'ineligible' | 'failed' }

const request = async (
  listId: string, actorUid: string, signal: AbortSignal, method: 'GET' | 'POST' | 'PUT', body?: object
): Promise<Response> => {
  signal.throwIfAborted()
  const token = await getActorIdToken(actorUid, signal)
  signal.throwIfAborted()
  if (!token) return new Response(null, { status: 401 })
  return fetch(`/api/lists/${encodeURIComponent(listId)}/background-ai-review`, {
    method,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal
  })
}

export const getBackgroundAiReviewAvailability = async (listId: string, actorUid: string, signal: AbortSignal) => withDeadline(async (bounded) => {
  const response = await request(listId, actorUid, bounded, 'GET')
  if (!response.ok) return null
  const capability = await response.json()
  return capability.enabled === true ? { synthetic: capability.synthetic === true } : null
}, 10_000, signal)

const snapshotVersion = async (snapshot: string) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshot))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const applyBackgroundAiReview = async (
  listId: string,
  snapshot: string,
  removals: string[],
  renames: { key: string; name: string }[],
  submission: { actorUid: string; operationId: string; signal: AbortSignal; categoryChanges?: { key: string; category: string; createCategory?: boolean }[] }
) => withDeadline(async (signal) => {
  const version = await snapshotVersion(snapshot)
  signal.throwIfAborted()
  const response = await request(listId, submission.actorUid, signal, 'PUT', {
    version, removals, renames,
    ...(submission.categoryChanges?.length ? { categoryChanges: submission.categoryChanges } : {}),
    actorUid: submission.actorUid, operationId: submission.operationId
  })
  if (response.status === 409) return null
  if (!response.ok) throw new Error('Could not apply the list review')
  return response.json()
}, 20_000, submission.signal)

export const requestBackgroundAiReview = async (
  listId: string, snapshot: string, language: 'en' | 'he', actorUid: string, signal: AbortSignal
): Promise<ReviewResponse> => withDeadline(async (bounded) => {
  const version = await snapshotVersion(snapshot)
  bounded.throwIfAborted()
  const response = await request(listId, actorUid, bounded, 'POST', { version, language })
  if (response.status === 429) return { kind: 'rate_limited', seconds: Number(response.headers.get('Retry-After')) || 60 }
  if (response.status === 409) return { kind: 'stale' }
  if (response.status === 422) return { kind: 'ineligible' }
  if ([401, 403, 404].includes(response.status)) return { kind: 'disabled' }
  if (!response.ok) return { kind: 'failed' }

  const body = await response.json()
  const result = aiListReviewResultSchema.safeParse(body?.result)
  return body?.version === version && result.success ? { kind: 'completed', result: result.data } : { kind: 'failed' }
}, 45_000, signal)
