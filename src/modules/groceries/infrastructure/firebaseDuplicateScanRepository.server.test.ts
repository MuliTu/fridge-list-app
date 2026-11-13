/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { randomBytes } from 'node:crypto'
import { deleteApp, initializeApp, type App } from 'firebase-admin/app'
import { getDatabaseWithUrl } from 'firebase-admin/database'
import { DUPLICATE_SCAN_MAX_ATTEMPTS, DUPLICATE_SCAN_ALGORITHM_VERSION, findDuplicateMatches, processDuplicateScanJobs } from '../application/duplicateScan.service'
import { createFirebaseDuplicateScanRepository, FirebaseDuplicateScanRepository } from './firebaseDuplicateScanRepository.server'

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
  const snapshot = (value: any) => ({
    val: () => value,
    exists: () => value !== null && value !== undefined &&
      (typeof value !== 'object' || Object.keys(value).length > 0),
    forEach: (visit: (child: { key: string; val: () => unknown }) => boolean | void) =>
      Object.keys(value ?? {}).some((key) => visit({ key, val: () => value[key] }) === true)
  })
  const result = {
    database: {
      ref: jest.fn((path: string) => {
        let startAfterKey: string | null = null
        let resultLimit: number | null = null
        const reference = {
          child: (key: string): any => result.database.ref(`${path}/${key}`),
          get: async () => {
            const value = read(path)
            if (!value || typeof value !== 'object' || Array.isArray(value) || (startAfterKey === null && resultLimit === null)) {
              return snapshot(value)
            }
            const entries = Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .filter(([key]) => startAfterKey === null || key > startAfterKey)
              .slice(0, resultLimit ?? undefined)
            return snapshot(Object.fromEntries(entries))
          },
          orderByChild: () => reference,
          orderByKey: () => reference,
          startAfter: (key: string) => { startAfterKey = key; return reference },
          limitToFirst: (limit: number) => { resultLimit = limit; return reference },
          set: async (value: unknown) => write(path, value),
          remove: async () => write(path, null),
          transaction: async (update: (current: any) => any) => {
            const next = update(read(path) ?? null)
            if (next === undefined) return { committed: false, snapshot: snapshot(read(path)) }
            write(path, next)
            return { committed: true, snapshot: snapshot(next) }
          }
        }
        return reference
      })
    },
    mutateList: async <T>(listId: string, mutate: (list: Record<string, unknown>) =>
      { value: Record<string, unknown>; result: T } | undefined) => {
      const path = `users/${listId}`
      const current = read(path)
      const change = current ? mutate(current) : undefined
      if (!change) return undefined
      write(path, change.value)
      return change.result
    },
    state
  }
  return result
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
  const repository = new FirebaseDuplicateScanRepository(fake.database as any, fake.mutateList)

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
    groceries: { a: { bought: false }, b: { bought: false } },
    duplicate_scan_ready: { source: { itemId: 'source', algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION, createdAt: 'old' } },
    duplicate_scan_jobs: { source: { ...job('running', 1), itemId: 'source', workerId: 'worker' } },
    duplicate_findings: {
      ignored: { state: 'ignored', createdAt: 'old' },
      deleting: { state: 'deleting', deletingItemId: 'b', createdAt: 'old' },
      resolved: { state: 'resolved', createdAt: 'old' }
    }
  } } })
  const repository = new FirebaseDuplicateScanRepository(fake.database as any, fake.mutateList)
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
  const repository = new FirebaseDuplicateScanRepository(fake.database as any, fake.mutateList)

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
  const repository = new FirebaseDuplicateScanRepository(fake.database as any, fake.mutateList)

  await expect(repository.findReadyJobs('2026-11-07T10:00:00.000Z', 2)).resolves.toEqual([
    { listId: 'a', itemId: 'one' },
    { listId: 'a', itemId: 'two' }
  ])
  expect(fake.state.duplicate_scan_worker_state.cursor).toBe('a')

  await repository.findReadyJobs('2026-11-07T10:01:00.000Z', 2)
  expect(fake.database.ref).toHaveBeenCalledWith('users/b/duplicate_scan_ready')
})

it('backfills unregistered lists in restartable pages without rescanning purchased items or losing decisions', async () => {
  const now = new Date('2026-11-07T10:00:00.000Z')
  const groceries = Object.fromEntries(Array.from({ length: 26 }, (_, i) => [
    `item-${String(i).padStart(2, '0')}`,
    { item: i < 3 ? 'Milk' : `Product ${i}`, bought: i >= 3 }
  ]))
  const matches = findDuplicateMatches('item-00', Object.entries(groceries).map(([id, grocery]) => ({
    id, name: grocery.item as string, bought: grocery.bought as boolean
  })))
  const ignored = matches[0].findingId
  const dismissed = matches[1].findingId
  const fake = fakeDatabase({ users: { legacy: {
    groceries,
    duplicate_findings: { [ignored]: { state: 'ignored', createdAt: 'old' } },
    duplicate_finding_views: { actor: { [dismissed]: { dismissedAt: 'old', readAt: 'old' } } }
  }, shared: { groceries: { only: { item: 'Bread', bought: false } } } } })
  const repository = new FirebaseDuplicateScanRepository(fake.database as any, fake.mutateList)
  const first = await repository.backfillBatch(null, now.toISOString())
  expect(first).toEqual({ queued: 3, nextCursor: { listId: 'legacy', itemId: 'item-24' } })
  await expect(repository.backfillBatch(null, now.toISOString())).resolves.toMatchObject({ queued: 0 })
  const second = await repository.backfillBatch(first.nextCursor, now.toISOString())
  expect(second).toEqual({ queued: 0, nextCursor: { listId: 'legacy' } })
  const third = await repository.backfillBatch(second.nextCursor, now.toISOString())
  expect(third).toEqual({ queued: 1, nextCursor: { listId: 'shared' } })
  await expect(repository.backfillBatch(third.nextCursor, now.toISOString())).resolves.toEqual({ queued: 0, nextCursor: null })

  await expect(processDuplicateScanJobs(repository, { now, workerId: 'one', limit: 10 }))
    .resolves.toEqual({ claimed: 4, completed: 4, failed: 0 })
  const list = fake.state.users.legacy
  expect(Object.keys(list.duplicate_scan_jobs)).toEqual(['item-00', 'item-01', 'item-02'])
  expect(Object.keys(list.duplicate_findings)).toHaveLength(3)
  expect(list.duplicate_findings[ignored]).toEqual({ state: 'ignored', createdAt: 'old' })
  expect(list.duplicate_finding_views.actor[dismissed]).toEqual({ dismissedAt: 'old', readAt: 'old' })
  await expect(repository.backfillBatch(null, now.toISOString())).resolves.toMatchObject({ queued: 0 })
  await expect(processDuplicateScanJobs(repository, { now, workerId: 'two' })).resolves.toMatchObject({ claimed: 0 })
})

it('serializes worker invocations and releases the lease after a failure', async () => {
  const now = new Date('2026-11-07T10:00:00.000Z')
  const fake = fakeDatabase({})
  const repository = new FirebaseDuplicateScanRepository(fake.database as any, fake.mutateList)
  let rejectRun!: (reason: Error) => void
  const first = repository.withWorkerLease('one', now, () => new Promise((_resolve, reject) => { rejectRun = reject }))
  const second = jest.fn()
  await expect(repository.withWorkerLease('two', now, second)).resolves.toBeNull()
  expect(second).not.toHaveBeenCalled()
  const failure = expect(first).rejects.toThrow('failed')
  rejectRun(new Error('failed'))
  await failure
  await expect(repository.withWorkerLease('three', now, async () => 'ran')).resolves.toBe('ran')
})

const emulatorPort = process.env.DUPLICATE_SCAN_EMULATOR_PORT
const emulatorTest = emulatorPort ? it : it.skip

emulatorTest('recovers legacy jobs and leases with independent cold Firebase clients', async () => {
  if (!emulatorPort || !/^\d{1,5}$/.test(emulatorPort)) throw new Error('Provide a local RTDB emulator port')
  const previousHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = `127.0.0.1:${emulatorPort}`
  const projectId = `demo-duplicate-worker-${randomBytes(3).toString('hex')}`
  const apps: App[] = []
  const connect = () => {
    const app = initializeApp({ projectId }, `${projectId}-${apps.length}`)
    apps.push(app)
    const databaseUrl = `https://${projectId}.firebaseio.com`
    const db = getDatabaseWithUrl(databaseUrl, app)
    return { db, repository: createFirebaseDuplicateScanRepository(app, databaseUrl) }
  }

  try {
    const now = new Date('2026-11-07T10:00:00.000Z')
    const iso = now.toISOString()
    const { db } = connect()
    const groceries = {
      0: { item: 'Milk', bought: false },
      1: { item: 'Milk', bought: false },
      2: { item: 'Milk', bought: true },
      3: { item: 'Bread', bought: false }
    }
    const { leaseUntil: _expiredLease, ...finishedJob } = { ...job('completed', 2), itemId: '3' }
    const list = db.ref('users/0')
    const ignored = findDuplicateMatches('0', [
      { id: '0', name: 'Milk', bought: false }, { id: '1', name: 'Milk', bought: false }
    ])[0].findingId
    await list.set({
      '.priority': 10,
      groceries: {
        ...groceries,
        '.priority': 11,
        0: { ...groceries[0], '.priority': 17, bought: { '.value': false, '.priority': 18 } },
        1: { ...groceries[1], item: { '.value': 'Milk', '.priority': 19 } }
      },
      duplicate_scan_jobs: { '.priority': 20, 3: { ...finishedJob, '.priority': 21 } },
      duplicate_findings: {
        [ignored]: { state: { '.value': 'ignored', '.priority': 22 }, createdAt: 'old', '.priority': 23 }
      },
      duplicate_finding_views: { actor: { [ignored]: { dismissedAt: 'old', readAt: 'old', '.priority': 31 } } }
    })

    const preservedExport = async () => {
      const state = (await list.get()).exportVal()
      return {
        listPriority: state['.priority'],
        groceries: state.groceries,
        jobsPriority: state.duplicate_scan_jobs['.priority'],
        finishedJob: state.duplicate_scan_jobs[3],
        findings: state.duplicate_findings,
        views: state.duplicate_finding_views
      }
    }
    const initial = await preservedExport()
    expect(initial).toMatchObject({
      listPriority: 10,
      groceries: { '.priority': 11, 0: { '.priority': 17, bought: { '.value': false, '.priority': 18 } } },
      jobsPriority: 20,
      finishedJob: { '.priority': 21 },
      findings: { [ignored]: { '.priority': 23, state: { '.value': 'ignored', '.priority': 22 } } },
      views: { actor: { [ignored]: { '.priority': 31 } } }
    })
    const { repository: backfill } = connect()
    await expect(backfill.backfillBatch(null, iso)).resolves.toEqual({ queued: 2, nextCursor: { listId: '0' } })
    await expect(connect().repository.backfillBatch(null, iso)).resolves.toMatchObject({ queued: 0 })
    expect((await db.ref('users/0/duplicate_scan_jobs/3').get()).val()).toEqual(finishedJob)
    expect((await db.ref('users/0/duplicate_scan_jobs/2').get()).exists()).toBe(false)
    expect(await preservedExport()).toEqual(initial)

    const changingJob = list.child('duplicate_scan_jobs/0')
    await changingJob.setPriority(24, () => {})
    await changingJob.child('attempts').setPriority(25, () => {})
    const lock = db.ref('duplicate_scan_worker_state/lease')
    await lock.set({ workerId: 'interrupted', until: now.getTime() - 1 })
    const { repository: worker } = connect()
    const counts = await worker.withWorkerLease('active', now, async () => {
      const contender = jest.fn()
      await expect(connect().repository.withWorkerLease('contender', now, contender)).resolves.toBeNull()
      expect(contender).not.toHaveBeenCalled()

      const ref = { listId: '0', itemId: '0' }
      const failedJob = await connect().repository.claim(ref, 'active', iso, iso)
      if (!failedJob) throw new Error('Expected a cold client to claim an existing job')
      for (let attempt = 1; attempt <= DUPLICATE_SCAN_MAX_ATTEMPTS; attempt += 1) {
        const claimed = attempt === 1 ? failedJob : await worker.claim(ref, 'active', iso, iso)
        if (!claimed) throw new Error('Expected failed job to be retried up to the attempt limit')
        expect(claimed.attempts).toBe(attempt)
        expect(await preservedExport()).toEqual(initial)
        await connect().repository.fail(claimed, 'scan_failed', iso)
        expect(await preservedExport()).toEqual(initial)
      }
      expect((await changingJob.get()).exportVal()).toMatchObject({
        '.priority': 24, status: 'failed', attempts: { '.value': DUPLICATE_SCAN_MAX_ATTEMPTS, '.priority': 25 }
      })
      expect((await db.ref('users/0/duplicate_scan_ready/0').get()).exists()).toBe(false)
      return processDuplicateScanJobs(worker, { now, workerId: 'active', limit: 10 })
    })
    expect(counts).toEqual({ claimed: 1, completed: 1, failed: 0 })
    expect((await lock.get()).exists()).toBe(false)
    expect(await preservedExport()).toEqual(initial)
    expect((await list.child('groceries').get()).val()).toEqual(Object.values(groceries))
    expect((await list.child('duplicate_scan_jobs/1/status').get()).val()).toBe('completed')
    expect((await list.child('duplicate_scan_ready/1').get()).exists()).toBe(false)

    // Interleave a purchase between the export read and its conditional write.
    const concurrentList = db.ref('users/1')
    const concurrentGrocery = concurrentList.child('groceries/a')
    await concurrentGrocery.set({ item: 'Apples', bought: false })
    const request = globalThis.fetch
    const statuses: number[] = []
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method !== 'PUT') return request(input, init)
      await concurrentGrocery.set({ item: 'Apples', bought: true, '.priority': 51 })
      const response = await request(input, init)
      statuses.push(response.status)
      return response
    })
    try {
      await expect(backfill.backfillBatch({ listId: '0' }, iso))
        .resolves.toEqual({ queued: 0, nextCursor: { listId: '1' } })
      expect(statuses).toEqual([412])
      expect((await concurrentGrocery.get()).exportVal()).toEqual({ item: 'Apples', bought: true, '.priority': 51 })
      expect((await concurrentList.child('duplicate_scan_jobs').get()).exists()).toBe(false)
      expect((await concurrentList.child('duplicate_scan_ready').get()).exists()).toBe(false)
    } finally {
      fetchSpy.mockRestore()
    }
  } finally {
    await Promise.all(apps.map((app) => deleteApp(app)))
    if (previousHost === undefined) delete process.env.FIREBASE_DATABASE_EMULATOR_HOST
    else process.env.FIREBASE_DATABASE_EMULATOR_HOST = previousHost
  }
}, 15_000)
