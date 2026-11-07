/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { DUPLICATE_SCAN_ALGORITHM_VERSION } from '../application/duplicateScan.service'
import { FirebaseDuplicateScanRepository } from './firebaseDuplicateScanRepository.server'

const fakeDatabase = (initial: Record<string, any>) => {
  const state = JSON.parse(JSON.stringify(initial))
  const locate = (path: string) => path.split('/').filter(Boolean)
  const read = (path: string) => locate(path).reduce((value, key) => value?.[key], state)
  const write = (path: string, value: unknown) => {
    const parts = locate(path)
    const key = parts.pop()!
    const parent = parts.reduce((value, part) => (value[part] ??= {}), state)
    parent[key] = value
  }
  return {
    database: {
      ref: jest.fn((path: string) => {
        let startAfterKey: string | null = null
        let resultLimit: number | null = null
        const reference = {
          get: async () => {
            const value = read(path)
            if (!value || typeof value !== 'object' || Array.isArray(value) || (startAfterKey === null && resultLimit === null)) {
              return { val: () => value }
            }
            const entries = Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .filter(([key]) => startAfterKey === null || key > startAfterKey)
              .slice(0, resultLimit ?? undefined)
            return { val: () => Object.fromEntries(entries) }
          },
          orderByChild: () => reference,
          orderByKey: () => reference,
          startAfter: (key: string) => { startAfterKey = key; return reference },
          limitToFirst: (limit: number) => { resultLimit = limit; return reference },
          set: async (value: unknown) => write(path, value),
          remove: async () => write(path, null),
          transaction: async (update: (current: any) => any) => {
          const next = update(read(path) ?? null)
          if (next === undefined) return { committed: false, snapshot: { val: () => read(path) } }
          write(path, next)
          return { committed: true, snapshot: { val: () => next } }
          }
        }
        return reference
      })
    },
    state
  }
}

const job = (status: string, attempts = 0, leaseUntil?: string) => ({
  itemId: 'item', status, attempts, leaseUntil,
  algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION,
  createdAt: '2026-11-07T09:00:00.000Z', updatedAt: '2026-11-07T09:00:00.000Z'
})
it('discovers only bounded queue references and never reads the users root', async () => {
  const ready = { item: { itemId: 'item', algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION, createdAt: '1' } }
  const fake = fakeDatabase({ duplicate_scan_lists: {
    pending: { listId: 'pending' }, stale: { listId: 'stale' }, exhausted: { listId: 'exhausted' }
  }, users: {
    pending: { duplicate_scan_ready: ready, duplicate_scan_jobs: { item: job('pending') } },
    stale: { duplicate_scan_ready: ready, duplicate_scan_jobs: { item: job('running', 1, '2026-11-07T09:59:00.000Z') } },
    exhausted: { duplicate_scan_ready: ready, duplicate_scan_jobs: { item: job('failed', 5) } }
  } })
  const repository = new FirebaseDuplicateScanRepository(fake.database as any)

  await expect(repository.findReadyJobs('2026-11-07T10:00:00.000Z', 2)).resolves.toEqual([
    { listId: 'exhausted', itemId: 'item' },
    { listId: 'pending', itemId: 'item' }
  ])
  expect(fake.database.ref).not.toHaveBeenCalledWith('users')
  await expect(repository.claim({ listId: 'stale', itemId: 'item' }, 'worker', '2026-11-07T10:00:00.000Z', '2026-11-07T10:01:00.000Z'))
    .resolves.toMatchObject({ attempts: 2, workerId: 'worker' })

  await expect(repository.claim({ listId: 'exhausted', itemId: 'item' }, 'worker', '2026-11-07T10:00:00.000Z', '2026-11-07T10:01:00.000Z'))
    .resolves.toBeNull()
  expect(fake.state.users.exhausted.duplicate_scan_ready.item).toBeUndefined()
  expect(fake.state.duplicate_scan_worker_state.cursor).toBe('pending')
})
it('completes one lease, removes its list-local ready marker, and preserves ignored, deleting, or resolved findings', async () => {
  const fake = fakeDatabase({ users: { list: {
    duplicate_scan_ready: { source: { itemId: 'source', algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION, createdAt: 'old' } },
    duplicate_scan_jobs: { source: { ...job('running', 1), itemId: 'source', workerId: 'worker' } },
    duplicate_findings: {
      ignored: { state: 'ignored', createdAt: 'old' },
      deleting: { state: 'deleting', deletingItemId: 'b', createdAt: 'old' },
      resolved: { state: 'resolved', createdAt: 'old' }
    }
  } } })
  const repository = new FirebaseDuplicateScanRepository(fake.database as any)
  const base = { itemIds: ['a', 'b'] as [string, string], algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION, reason: 'exact' as const, score: 1 }

  await repository.complete({ listId: 'list', itemId: 'source', workerId: 'worker', attempts: 1 }, [
    { ...base, findingId: 'ignored' },
    { ...base, findingId: 'deleting' },
    { ...base, findingId: 'resolved' },
    { ...base, findingId: 'open' }
  ], '2026-11-07T10:00:00.000Z')

  expect(fake.state.users.list.duplicate_findings.ignored.state).toBe('ignored')
  expect(fake.state.users.list.duplicate_findings.deleting).toMatchObject({ state: 'deleting', deletingItemId: 'b' })
  expect(fake.state.users.list.duplicate_findings.resolved.state).toBe('resolved')
  expect(fake.state.users.list.duplicate_findings.open).toMatchObject({ state: 'open', reason: 'exact', score: 1 })
  expect(fake.state.users.list.duplicate_scan_jobs.source).toMatchObject({ status: 'completed', workerId: null })
  expect(fake.state.users.list.duplicate_scan_ready.source).toBeUndefined()
})

it('rotates through the bounded registry without reading unrelated list groceries', async () => {
  const ready = { item: { itemId: 'item', algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION, createdAt: '1' } }
  const fake = fakeDatabase({
    duplicate_scan_lists: { a: { listId: 'a' }, b: { listId: 'b' }, c: { listId: 'c' } },
    duplicate_scan_worker_state: { cursor: 'b' },
    users: { c: { duplicate_scan_ready: ready } }
  })
  const repository = new FirebaseDuplicateScanRepository(fake.database as any)

  await expect(repository.findReadyJobs('2026-11-07T10:00:00.000Z', 1))
    .resolves.toEqual([{ listId: 'c', itemId: 'item' }])
  expect(fake.database.ref).toHaveBeenCalledWith('users/c/duplicate_scan_ready')
  expect(fake.database.ref).not.toHaveBeenCalledWith('users/a/duplicate_scan_ready')
  expect(fake.database.ref).not.toHaveBeenCalledWith('users/b/duplicate_scan_ready')
})

it('advances the registry cursor only through lists actually inspected', async () => {
  const ready = (itemId: string) => ({ itemId, algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION, createdAt: itemId })
  const fake = fakeDatabase({
    duplicate_scan_lists: { a: { listId: 'a' }, b: { listId: 'b' }, c: { listId: 'c' } },
    users: { a: { duplicate_scan_ready: { one: ready('one'), two: ready('two') } } }
  })
  const repository = new FirebaseDuplicateScanRepository(fake.database as any)

  await expect(repository.findReadyJobs('2026-11-07T10:00:00.000Z', 2)).resolves.toEqual([
    { listId: 'a', itemId: 'one' },
    { listId: 'a', itemId: 'two' }
  ])
  expect(fake.state.duplicate_scan_worker_state.cursor).toBe('a')

  await repository.findReadyJobs('2026-11-07T10:01:00.000Z', 2)
  expect(fake.database.ref).toHaveBeenCalledWith('users/b/duplicate_scan_ready')
})
