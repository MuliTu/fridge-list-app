/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { createHash } from 'node:crypto'
import type { Database } from 'firebase-admin/database'
import { AuthenticatedUserHandler } from '../../identity/server'
import { ApplicationError } from '../../shared'
import { type MutateList, createListMutation } from '../../shared/server'
import { withDeadline } from '../../../lib/withDeadline'
import type { App } from 'firebase-admin/app'
import { backgroundReviewItems } from '../domain/backgroundAiReview'
import { createBackgroundAiReviewHandler } from './backgroundAiReviewHttp.server'
import { GroqRateLimitError, reviewWithGroq } from './groqBackgroundReview.server'

const entries = [
  { key: 'one', item: 'Milk', bought: false, list_name: null },
  { key: 'two', item: 'Milk', bought: false, list_name: null }
]
const groceries = Object.fromEntries(entries.map(({ key, ...item }) => [key, item]))
const version = createHash('sha256').update(JSON.stringify(backgroundReviewItems(entries))).digest('hex')
const operationId = '61a46801-6bd9-43c0-8c6d-c7d3793e53ba'
const result = { mode: 'list_review' as const, duplicates: [], renames: [] }
const environment = { BACKGROUND_AI_REVIEW_ENABLED: 'true', GROQ_BACKGROUND_REVIEW_API_KEY: 'test' }

function setup(uid: string | null = 'owner', env: NodeJS.ProcessEnv = environment) {
  let quota: unknown
  let operation = 0
  const household = {
    ownerUid: 'owner',
    members: { viewer: { status: 'approved', role: 'viewer' }, editor: { status: 'approved', role: 'editor' } },
    groceries: structuredClone(groceries),
    categories: {} as Record<string, { name: string }>,
    listChangeHistory: {}
  }
  const snapshot = (value: unknown) => ({ val: () => value, exists: () => value != null })
  const grocerySnapshot = (name: string | null, limit: number) => {
    const rows = Object.entries(household.groceries)
      .filter(([, value]) => (value.list_name ?? null) === name).slice(0, limit)
    return {
      numChildren: () => rows.length,
      forEach: (callback: (child: { key: string; val: () => unknown }) => void) =>
        rows.forEach(([key, value]) => callback({ key, val: () => value }))
    }
  }
  const getGroceries = jest.fn(async () => grocerySnapshot(null, 301))
  const quotaTransaction = jest.fn(async (update: (value: unknown) => unknown) => {
    // The real SDK may start every transaction from a cold local null.
    const optimistic = update(null)
    const next = optimistic === undefined ? undefined : update(quota ?? null)
    if (next !== undefined) quota = next
    return { committed: next !== undefined, snapshot: snapshot(quota) }
  })
  const listTransaction = jest.fn(async (update: (value: unknown) => unknown) => {
    const next = update(household)
    if (next !== undefined) Object.assign(household, JSON.parse(JSON.stringify(next,
      (_key, value) => Array.isArray(value) && value.length === 0 ? undefined : value)))
    return { committed: next !== undefined, snapshot: snapshot(household) }
  })
  const ref = jest.fn((path: string) => {
    if (path.endsWith('/groceries')) return { orderByChild: () => ({
      equalTo: (name: string | null) => ({
        limitToFirst: (limit: number) => ({ get: name === null ? getGroceries : async () => grocerySnapshot(name, limit) })
      })
    }) }
    if (path.endsWith('/categories')) return {
      limitToFirst: (limit: number) => ({
        get: async () => {
          const values = Object.values(household.categories).slice(0, limit)
          return { numChildren: () => values.length, forEach: (callback: (child: { val: () => unknown }) => void) =>
            values.forEach((value) => callback({ val: () => value })) }
        }
      })
    }
    if (path === '_server/backgroundAiReview/groq') return { transaction: quotaTransaction }
    if (path === 'users/list') return {
      child: () => ({ push: () => ({ key: `event-${++operation}` }) }),
      transaction: listTransaction
    }
    const value = path === 'users/list/ownerUid' ? household.ownerUid
      : path === 'users/list/members/viewer' ? household.members.viewer
      : path === 'users/list/members/editor' ? household.members.editor : null
    return { get: async () => snapshot(value) }
  })
  const authenticate = new AuthenticatedUserHandler({
    authenticationService: {
      execute: async () => {
        if (!uid) throw new ApplicationError('unauthenticated', 'Requires auth')
        return { kind: 'user', uid, email: null, emailVerified: true }
      }
    }
  })
  const analyze = jest.fn<ReturnType<typeof reviewWithGroq>, Parameters<typeof reviewWithGroq>>(async () => result)
  const mutateList: MutateList = async (_listId, mutate, options) => withDeadline(async (signal) => {
    let change: ReturnType<typeof mutate>
    const applied = await listTransaction((value) => {
      if (signal.aborted) return undefined
      change = mutate(value as Record<string, unknown>)
      return change?.value
    })
    return applied.committed ? change?.result : undefined
  }, options?.timeoutMs ?? 5000, options?.signal)
  const createHandler = (mutation: MutateList = mutateList) => createBackgroundAiReviewHandler({
    environment: env,
    getAuthenticatedUserHandler: () => authenticate,
    database: () => ({ ref }) as unknown as Database,
    mutateList: mutation,
    analyze
  })
  const request = (method = 'POST', body: unknown = { version, language: 'en' }, listId = 'list', mutation?: MutateList) =>
    createHandler(mutation)({
      listId,
      request: new Request('http://localhost/review', {
        method,
        ...(method !== 'GET' && { body: JSON.stringify(body) })
      })
    })
  return { request, analyze, getGroceries, household, ref, quotaTransaction, listTransaction }
}

it.each([
  ['disabled', 'owner', {}, 404],
  ['anonymous', null, environment, 401],
  ['viewer', 'viewer', environment, 403],
  ['unrelated', 'unrelated', environment, 403]
])('denies %s without reading groceries or calling Groq', async (_label, uid, env, code) => {
  const test = setup(uid, env)
  expect((await test.request()).status).toBe(code)
  expect(test.getGroceries).not.toHaveBeenCalled()
  expect(test.analyze).not.toHaveBeenCalled()
})

it('accepts only a digest and language, and refuses an earlier list version', async () => {
  const test = setup()
  expect((await test.request('POST', { version, language: 'en', items: entries })).status).toBe(400)
  expect((await test.request('POST', { version: '0'.repeat(64), language: 'en' })).status).toBe(409)
  expect(test.analyze).not.toHaveBeenCalled()
})

it('checks household scope and shares provider cooldown across handler instances', async () => {
  const test = setup('editor')
  expect((await test.request('GET', {}, 'unrelated')).status).toBe(403)
  const response = await test.request()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ version, result })
  const retry = await test.request()
  expect(retry.status).toBe(429)
  expect(Number(retry.headers.get('Retry-After'))).toBeGreaterThan(0)
  expect(test.analyze).toHaveBeenCalledTimes(1)
})

it('extends shared cooldown on a provider 429 and never calls twice within the same request', async () => {
  const test = setup()
  test.analyze.mockRejectedValueOnce(new GroqRateLimitError(70))
  const response = await test.request()
  expect(response.status).toBe(429)
  expect(response.headers.get('Retry-After')).toBe('70')
  expect((await test.request()).status).toBe(429)
  expect(test.analyze).toHaveBeenCalledTimes(1)
})

it('checks for edits and access revocation after the provider returns', async () => {
  const changed = setup()
  changed.analyze.mockImplementationOnce(async () => {
    changed.household.groceries.one.item = 'Changed'
    return result
  })
  expect((await changed.request()).status).toBe(409)

  const revoked = setup('editor')
  revoked.analyze.mockImplementationOnce(async () => {
    revoked.household.members.editor.status = 'revoked'
    return result
  })
  expect((await revoked.request()).status).toBe(403)
})

it('applies confirmed changes atomically and replays the original result', async () => {
  const test = setup()
  const body = { version, actorUid: 'owner', operationId, removals: ['one'], renames: [{ key: 'two', name: 'Whole milk' }] }
  const response = await test.request('PUT', body)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ removedKeys: ['one'], renamedKeys: ['two'] })
  expect(Object.keys(test.household.groceries)).toEqual(['two'])
  expect(test.household.groceries.two.item).toBe('Whole milk')
  expect(Object.keys(test.household.listChangeHistory)).toHaveLength(2)
  expect((await test.request('PUT', body)).status).toBe(200)
  expect(Object.keys(test.household.listChangeHistory)).toHaveLength(2)
  expect((await test.request('PUT', { ...body, removals: ['two'], renames: [] })).status).toBe(409)
  expect(test.analyze).not.toHaveBeenCalled()
})

it('preserves image-backed removals, unrelated subtrees and audit metadata', async () => {
  const test = setup()
  Object.assign(test.household.groceries.one, { image_ref: 'image-one' })
  Object.assign(test.household, { receipts: { private: 'sentinel' }, stock: { untouched: true } })
  const response = await test.request('PUT', {
    actorUid: 'owner', operationId, version, removals: ['one'], renames: [{ key: 'two', name: 'Whole milk' }]
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ removed: 0, renamed: 1, skippedKeys: ['one'] })
  expect(test.household.groceries.one).toMatchObject({ image_ref: 'image-one', item: 'Milk' })
  expect(test.household).toMatchObject({ receipts: { private: 'sentinel' }, stock: { untouched: true } })
  expect(Object.values(test.household.listChangeHistory)).toEqual([
    expect.objectContaining({ type: 'renamed', previousName: 'Milk', itemName: 'Whole milk', itemKey: 'two' })
  ])
})

it('rejects actor substitution, changed snapshots and oversized transaction data without writes', async () => {
  const test = setup()
  const body = { actorUid: 'editor', operationId, version, removals: ['one'], renames: [] }
  expect((await test.request('PUT', body)).status).toBe(403)
  expect((await test.request('PUT', { ...body, actorUid: 'owner', version: '0'.repeat(64) })).status).toBe(409)
  Object.assign(test.household, { unrelated: 'x'.repeat(1_048_576) })
  expect((await test.request('PUT', { ...body, actorUid: 'owner' })).status).toBe(422)
  expect(Object.keys(test.household.groceries)).toHaveLength(2)
  expect(test.household.listChangeHistory).toEqual({})
})

it('bounds stalled Firebase reads and ignores their late result', async () => {
  jest.useFakeTimers()
  try {
    const test = setup()
    test.getGroceries.mockImplementationOnce(() => new Promise(() => undefined))
    const pending = test.request()
    await jest.advanceTimersByTimeAsync(5000)
    expect((await pending).status).toBe(503)
    expect(test.analyze).not.toHaveBeenCalled()
  } finally { jest.useRealTimers() }
})

it('spaces dispatches after delayed preflight, including a concurrent claimant', async () => {
  jest.useFakeTimers()
  try {
    const test = setup()
    const read = test.getGroceries.getMockImplementation()!
    test.getGroceries.mockImplementationOnce(read).mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4000))
      return read()
    })
    const first = test.request()
    await jest.advanceTimersByTimeAsync(1000)
    expect((await test.request()).status).toBe(429)
    await jest.advanceTimersByTimeAsync(3000)
    expect((await first).status).toBe(200)
    await jest.advanceTimersByTimeAsync(56_000)
    expect((await test.request()).status).toBe(429)
    expect(test.analyze).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(4000)
    expect((await test.request()).status).toBe(200)
    expect(test.analyze).toHaveBeenCalledTimes(2)
  } finally { jest.useRealTimers() }
})

it('supports the existing Groq key with a dedicated override taking precedence', async () => {
  const shared = setup('owner', { BACKGROUND_AI_REVIEW_ENABLED: 'true', GROQ_API_KEY: 'shared-test' })
  expect((await shared.request()).status).toBe(200)
  expect(shared.analyze.mock.calls[0]).toContain('shared-test')
  const dedicated = setup('owner', { ...environment, GROQ_API_KEY: 'shared-test' })
  expect((await dedicated.request()).status).toBe(200)
  expect(dedicated.analyze.mock.calls[0]).toContain('test')
})

it('rechecks revoked membership in the mutation transaction and refuses replay after revocation', async () => {
  const test = setup('editor')
  const body = { actorUid: 'editor', operationId, version, removals: ['one'], renames: [] }
  const transact = test.listTransaction.getMockImplementation()!
  test.listTransaction.mockImplementationOnce(async (update) => {
    test.household.members.editor.status = 'revoked'
    return transact(update)
  })
  expect((await test.request('PUT', body)).status).toBe(409)
  expect(Object.keys(test.household.groceries)).toHaveLength(2)
  expect(test.household.listChangeHistory).toEqual({})
  test.household.members.editor.status = 'approved'
  expect((await test.request('PUT', body)).status).toBe(200)
  test.household.members.editor.status = 'revoked'
  expect((await test.request('PUT', body)).status).toBe(403)
})

it('concurrent same-operation confirmations create one audit result', async () => {
  const test = setup()
  const body = { actorUid: 'owner', operationId, version, removals: ['one'], renames: [] }
  const responses = await Promise.all([test.request('PUT', body), test.request('PUT', body)])
  expect(responses.map(({ status }) => status)).toEqual([200, 200])
  expect(await responses[0].json()).toEqual(await responses[1].json())
  expect(Object.keys(test.household.listChangeHistory)).toHaveLength(1)
})

it('bounds stalled lease finalization and keeps the protective lease until expiry', async () => {
  jest.useFakeTimers()
  try {
    const test = setup()
    const transact = test.quotaTransaction.getMockImplementation()!
    test.quotaTransaction.mockImplementationOnce(transact).mockImplementationOnce(() => new Promise(() => undefined))
    const pending = test.request()
    await jest.advanceTimersByTimeAsync(5000)
    expect((await pending).status).toBe(200)
    await jest.advanceTimersByTimeAsync(55_000)
    expect((await test.request()).status).toBe(429)
    expect(test.analyze).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(60_000)
    expect((await test.request()).status).toBe(200)
    expect(test.analyze).toHaveBeenCalledTimes(2)
  } finally { jest.useRealTimers() }
})

it('a transaction callback arriving after its deadline cannot apply changes', async () => {
  jest.useFakeTimers()
  try {
    const test = setup()
    let late!: (value: unknown) => unknown
    test.listTransaction.mockImplementationOnce((update) => {
      late = update
      return new Promise(() => undefined)
    })
    const pending = test.request('PUT', { actorUid: 'owner', operationId, version, removals: ['one'], renames: [] })
    await jest.advanceTimersByTimeAsync(5000)
    expect((await pending).ok).toBe(false)
    expect(late(test.household)).toBeUndefined()
    expect(Object.keys(test.household.groceries)).toHaveLength(2)
    expect(test.household.listChangeHistory).toEqual({})
  } finally { jest.useRealTimers() }
})

it('finalizes a successful lease even when the SDK starts with a cold null cache', async () => {
  const test = setup()
  expect((await test.request()).status).toBe(200)
  const limited = await test.request()
  expect(limited.status).toBe(429)
  expect(Number(limited.headers.get('Retry-After'))).toBeLessThanOrEqual(60)
})

it('does not extend the provider retry timestamp when finalization is delayed', async () => {
  jest.useFakeTimers()
  try {
    const test = setup()
    const transact = test.quotaTransaction.getMockImplementation()!
    test.quotaTransaction.mockImplementationOnce(transact).mockImplementationOnce(async (update) => {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      return transact(update)
    })
    test.analyze.mockRejectedValueOnce(new GroqRateLimitError(70))
    const pending = test.request()
    await jest.advanceTimersByTimeAsync(2000)
    const limited = await pending
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('70')
    await jest.advanceTimersByTimeAsync(68_000)
    expect((await test.request()).status).toBe(200)
  } finally { jest.useRealTimers() }
})

it('rejects nested priorities before any conditional write', async () => {
  const originalFetch = global.fetch
  const app = { options: { credential: { getAccessToken: async () => ({ access_token: 'test' }) } } } as App
  const test = setup()
  const exported = { ...test.household, groceries: { ...test.household.groceries, '.priority': 9 } }
  global.fetch = jest.fn(async () => new Response(JSON.stringify(exported), { headers: { etag: 'v1' } }))
  try {
    const response = await test.request('PUT', { actorUid: 'owner', operationId, version, removals: ['one'], renames: [] },
      'list', createListMutation(app, 'https://example.firebaseio.com'))
    expect(response.status).toBe(422)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(jest.mocked(fetch).mock.calls[0][1]?.method).toBeUndefined()
  } finally { global.fetch = originalFetch }
})

it('rechecks the snapshot after an ETag conflict without writing stale changes', async () => {
  const originalFetch = global.fetch
  const app = { options: { credential: { getAccessToken: async () => ({ access_token: 'test' }) } } } as App
  const test = setup()
  const changed = structuredClone(test.household)
  changed.groceries.two.item = 'Changed concurrently'
  global.fetch = jest.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(test.household), { headers: { etag: 'v1' } }))
    .mockResolvedValueOnce(new Response(null, { status: 412 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(changed), { headers: { etag: 'v2' } }))
  try {
    const response = await test.request('PUT', { actorUid: 'owner', operationId, version, removals: ['one'], renames: [] },
      'list', createListMutation(app, 'https://example.firebaseio.com'))
    expect(response.status).toBe(409)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(jest.mocked(fetch).mock.calls[1][1]?.headers).toMatchObject({ 'If-Match': 'v1' })
    expect(jest.mocked(fetch).mock.calls.filter((call) => call[1]?.method === 'PUT')).toHaveLength(1)
  } finally { global.fetch = originalFetch }
})

it('rechecks new metadata after an ETag conflict and refuses a second write', async () => {
  const originalFetch = global.fetch
  const app = { options: { credential: { getAccessToken: async () => ({ access_token: 'test' }) } } } as App
  const test = setup()
  const changed = { ...test.household, groceries: { ...test.household.groceries, '.priority': 9 } }
  global.fetch = jest.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(test.household), { headers: { etag: 'v1' } }))
    .mockResolvedValueOnce(new Response(null, { status: 412 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(changed), { headers: { etag: 'v2' } }))
  try {
    const response = await test.request('PUT', { actorUid: 'owner', operationId, version, removals: ['one'], renames: [] },
      'list', createListMutation(app, 'https://example.firebaseio.com'))
    expect(response.status).toBe(422)
    expect(jest.mocked(fetch).mock.calls.filter((call) => call[1]?.method === 'PUT')).toHaveLength(1)
  } finally { global.fetch = originalFetch }
})

it('preserves unrelated export metadata verbatim during a guarded write', async () => {
  const originalFetch = global.fetch
  const app = { options: { credential: { getAccessToken: async () => ({ access_token: 'test' }) } } } as App
  const test = setup()
  const metadata = {
    '.priority': 2,
    receipts: { sentinel: { '.value': 'preserve', '.priority': 9 } },
    stock: { '.priority': 5, one: { quantity: { '.value': 3, '.priority': 7 } } },
    config: { '.priority': 8, order: ['one', 'two'] }
  }
  const exported = { ...test.household, ...metadata }
  global.fetch = jest.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(exported), { headers: { etag: 'v1' } }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
  try {
    const response = await test.request('PUT', { actorUid: 'owner', operationId, version, removals: ['one'], renames: [] },
      'list', createListMutation(app, 'https://example.firebaseio.com'))
    expect(response.status).toBe(200)
    const written = JSON.parse(String(jest.mocked(fetch).mock.calls[1][1]?.body))
    for (const [key, value] of Object.entries(metadata)) expect(written[key]).toEqual(value)
    expect(written.groceries.one).toBeUndefined()
  } finally { global.fetch = originalFetch }
})

it.each([
  ['2026-11-14T08:00:00+02:00', '2026-11-14T04:00:00Z', 'Kept the item with the earlier recorded addition date'],
  ['2026-02-30T00:00:00Z', '2026-11-14T04:00:00Z', 'Kept the item with a valid recorded addition date'],
  [undefined, '2026-11-14T04:00:00Z', 'Kept the item with a valid recorded addition date']
])('ranks equal-status duplicates using valid history from the rechecked source (%s, %s)', async (firstTime, secondTime, reason) => {
  const test = setup('editor')
  Object.assign(test.household.groceries.one, { added_at: '2026-01-01T00:00:00.000Z' })
  const read = test.getGroceries.getMockImplementation()!
  test.getGroceries.mockImplementationOnce(read).mockImplementationOnce(async () => {
    Object.assign(test.household.groceries.one, { added_at: firstTime })
    Object.assign(test.household.groceries.two, { added_at: secondTime })
    return read()
  })
  const send = async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] })
  test.analyze.mockImplementationOnce((key, items, language, signal, _send, history) =>
    reviewWithGroq(key, items, language, signal, send, history))

  const response = await test.request()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ version, result: {
    ...result, duplicates: [{ keepKey: 'two', removeKeys: ['one'], reason }]
  } })
})

it('applies a proposed spelling correction only for an authorized editor confirming the current list', async () => {
  const test = setup('editor')
  test.household.groceries.one.item = 'Tomatos'
  const reviewVersion = createHash('sha256').update(JSON.stringify(backgroundReviewItems([
    { ...test.household.groceries.one, key: 'one' }, { ...test.household.groceries.two, key: 'two' }
  ]))).digest('hex')
  const proposed = {
    ...result, renames: [{ key: '1', currentName: 'Tomatos', suggestedName: 'Tomatoes', reason: 'Correct spelling' }]
  }
  const send = async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(proposed) } }] })
  test.analyze.mockImplementationOnce((key, items, language, signal) => reviewWithGroq(key, items, language, signal, send))

  const response = await test.request('POST', { version: reviewVersion, language: 'en' })
  expect(response.status).toBe(200)
  const review = await response.json()
  expect(review).toEqual({ version: reviewVersion, result: { ...proposed, renames: [{ ...proposed.renames[0], key: 'one' }] } })
  expect(test.household.groceries.one.item).toBe('Tomatos')
  expect(test.listTransaction).not.toHaveBeenCalled()

  const confirmation = {
    version: review.version, actorUid: 'editor', operationId, removals: [],
    renames: review.result.renames.map(({ key, suggestedName }: { key: string; suggestedName: string }) => ({ key, name: suggestedName }))
  }
  test.household.members.editor.status = 'revoked'
  expect((await test.request('PUT', confirmation)).status).toBe(403)
  test.household.members.editor.status = 'approved'
  test.household.groceries.two.item = 'Whole milk'
  expect((await test.request('PUT', confirmation)).status).toBe(409)
  expect(test.household.groceries.one.item).toBe('Tomatos')
  expect(test.household.listChangeHistory).toEqual({})

  test.household.groceries.two.item = 'Milk'
  expect((await test.request('PUT', confirmation)).status).toBe(200)
  expect(test.household.groceries.one.item).toBe('Tomatoes')
})

it('scans only the main list even with hundreds of custom-list items', async () => {
  const test = setup()
  Object.assign(test.household.groceries.one, { list_name: '' })
  Object.assign(test.household.groceries, Object.fromEntries(Array.from({ length: 301 }, (_, index) => [
    `custom-${index}`, { item: 'Milk', bought: true, list_name: 'Pantry' }
  ])))
  expect((await test.request()).status).toBe(200)
  expect(test.analyze.mock.calls[0][1]).toEqual(entries)
  expect((await test.request('PUT', {
    version, actorUid: 'owner', operationId, removals: ['custom-0'], renames: []
  })).status).toBe(409)
  expect(Object.hasOwn(test.household.groceries, 'custom-0')).toBe(true)
})

it('suggests evidence-backed moves out of Other and requires authorized confirmation', async () => {
  const test = setup('editor')
  test.household.categories.fruit = { name: 'פירות' }
  test.household.categories.produce = { name: 'ירקות' }
  test.household.categories.bakery = { name: 'מאפים' }
  Object.assign(test.household.groceries, {
    one: { item: 'אפרסק', category: 'אחר', list_name: null, bought: false },
    two: { item: 'לחם', category: 'קטגוריה שנמחקה', list_name: null, bought: false },
    history: { item: 'לחם', category: 'מאפים', list_name: null, bought: true },
    uncertain: { item: 'Unknown product', category: 'אחר', list_name: null, bought: false },
    outside: { item: 'גזר', category: 'אחר', list_name: 'Trip', bought: false }
  })
  const items = Object.entries(test.household.groceries).map(([key, item]) => ({ key, ...item }))
  const reviewVersion = createHash('sha256').update(JSON.stringify(backgroundReviewItems(items))).digest('hex')
  const suggestions = [{ key: 'one', category: 'פירות', reason: 'Fruit' }, { key: 'uncertain', category: 'ציוד', reason: 'New group', createCategory: true }]
  test.analyze.mockResolvedValue({ ...result, categoryChanges: suggestions })
  const response = await test.request('POST', { version: reviewVersion, language: 'en' })
  expect(response.status).toBe(200)
  expect((await response.json()).result.categoryChanges).toEqual(suggestions)
  expect(test.analyze).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([
    expect.objectContaining({ key: 'history', category: 'מאפים' })
  ]), 'en', expect.anything(), undefined, expect.any(Map), expect.arrayContaining(['פירות', 'ירקות', 'מאפים']))
  expect(test.household.groceries.one).toMatchObject({ category: 'אחר' })

  const selection = { version: reviewVersion, actorUid: 'editor', operationId, removals: [], renames: [] }
  const change = { key: 'one', category: 'פירות' }
  expect((await test.request('PUT', { ...selection, categoryChanges: [{ key: 'outside', category: 'ירקות' }] })).status).toBe(409)
  expect((await test.request('PUT', { ...selection, categoryChanges: [{ key: 'one', category: 'Unavailable' }] })).status).toBe(409)
  expect((await test.request('PUT', { ...selection, actorUid: 'viewer', categoryChanges: [change] })).status).toBe(403)
  expect((await test.request('PUT', { ...selection, removals: ['one'], categoryChanges: [change] })).status).toBe(400)

  delete test.household.categories.fruit
  expect((await test.request('PUT', { ...selection, categoryChanges: [change] })).status).toBe(409)
  test.household.categories.fruit = { name: 'פירות' }
  Object.assign(test.household.groceries.one, { category: 'ירקות' })
  expect((await test.request('PUT', { ...selection, categoryChanges: [change] })).status).toBe(409)
  Object.assign(test.household.groceries.one, { category: 'אחר' })
  const approved = { ...selection, categoryChanges: [change, { key: 'uncertain', category: 'ציוד', createCategory: true }] }
  const applied = await test.request('PUT', approved)
  expect(applied.status).toBe(200)
  const appliedResult = await applied.json()
  expect(appliedResult).toMatchObject({ recategorized: 2, recategorizedKeys: ['one', 'uncertain'] })
  expect(test.household.groceries.one).toMatchObject({ category: 'פירות' })
  expect(test.household.groceries.two).toMatchObject({ category: 'קטגוריה שנמחקה' })
  expect(Object.values(test.household.categories)).toContainEqual(expect.objectContaining({ name: 'ציוד' }))
  expect(await (await test.request('PUT', approved)).json()).toEqual(appliedResult)
})

it('leaves a fallback item alone when equally named items disagree on the category', async () => {
  const test = setup()
  test.household.categories = { fruit: { name: 'פירות' }, frozen: { name: 'קפואים' } }
  Object.assign(test.household.groceries, {
    one: { item: 'אפרסק', category: 'אחר', list_name: null, bought: false },
    two: { item: 'אפרסקים', category: 'פירות', list_name: null, bought: true },
    third: { item: 'אפרסק', category: 'קפואים', list_name: null, bought: true }
  })
  const items = Object.entries(test.household.groceries).map(([key, item]) => ({ key, ...item }))
  const reviewVersion = createHash('sha256').update(JSON.stringify(backgroundReviewItems(items))).digest('hex')
  const response = await test.request('POST', { version: reviewVersion, language: 'he' })
  expect(response.status).toBe(200)
  expect((await response.json()).result).not.toHaveProperty('categoryChanges')
})

it('returns more than fifteen model category suggestions', async () => {
  const test = setup()
  test.household.categories.fruit = { name: 'פירות' }
  Object.assign(test.household.groceries, Object.fromEntries(Array.from({ length: 17 }, (_, index) => [
    `peach-${String(index).padStart(2, '0')}`, { item: 'אפרסק', category: 'אחר', list_name: null, bought: false }
  ])))
  test.analyze.mockResolvedValue({ ...result, categoryChanges: Object.keys(test.household.groceries)
    .filter((key) => key.startsWith('peach-')).map((key) => ({ key, category: 'פירות', reason: 'Fruit' })) })
  const items = Object.entries(test.household.groceries).map(([key, item]) => ({ key, ...item }))
  const reviewVersion = createHash('sha256').update(JSON.stringify(backgroundReviewItems(items))).digest('hex')
  const response = await test.request('POST', { version: reviewVersion, language: 'he' })
  expect(response.status).toBe(200)
  const { categoryChanges } = (await response.json()).result
  expect(categoryChanges).toHaveLength(17)
  expect(categoryChanges[0]).toMatchObject({ key: 'peach-00' })
  expect(categoryChanges[16]).toMatchObject({ key: 'peach-16' })
  const applied = await test.request('PUT', {
    version: reviewVersion, actorUid: 'owner', operationId, removals: [], renames: [],
    categoryChanges: [{ key: 'peach-16', category: 'פירות' }]
  })
  expect(applied.status).toBe(200)
})
