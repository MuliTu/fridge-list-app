import '@tanstack/react-start/server-only'

import { getDatabaseWithUrl, type Database, type Query } from 'firebase-admin/database'
import type { App } from 'firebase-admin/app'
import { ApplicationError } from '../../shared'
import { createListMutation, type MutateList } from '../../shared/server'
import {
  DUPLICATE_SCAN_ALGORITHM_VERSION,
  DUPLICATE_SCAN_MAX_ATTEMPTS,
  type ClaimedDuplicateScanJob,
  type DuplicateCandidate,
  type DuplicateMatch,
  type DuplicateScanJobRef,
  type DuplicateScanRepository
} from '../application/duplicateScan.service'

type RecordNode = Record<string, unknown>

type StoredListRegistration = {
  listId?: unknown
}
const object = (value: unknown): RecordNode => {
  // RTDB serializes dense numeric keys as arrays when reading a regular snapshot.
  if (Array.isArray(value)) return { ...value }
  return value && typeof value === 'object' ? value as RecordNode : {}
}
// Exported scalar nodes with a priority use { '.value': value, '.priority': priority }.
const scalar = (value: unknown): unknown => {
  const node = object(value)
  return Object.hasOwn(node, '.value') ? node['.value'] : value
}

const updateFields = (node: RecordNode, fields: RecordNode): RecordNode => {
  const next = { ...node }
  for (const [key, value] of Object.entries(fields)) {
    if (value === scalar(node[key])) continue
    const priority = object(node[key])['.priority']
    next[key] = value !== null && priority !== undefined
      ? { '.value': value, '.priority': priority }
      : value
  }
  return next
}

const safeSegment = (value: string): boolean => Boolean(value) && value.length <= 200 &&
  value.trim() === value && !/[.#$/[\]\u0000-\u001f\u007f]/.test(value)
const assertReference = (reference: DuplicateScanJobRef): void => {
  if (!safeSegment(reference.listId) || !safeSegment(reference.itemId)) {
    throw new ApplicationError('invalid_input', 'Invalid duplicate scan job reference')
  }
}

export type DuplicateBackfillCursor = { listId: string; itemId?: string }

const BACKFILL_PAGE_SIZE = 25
// Keep this above maxDuration (120 seconds) in scripts/vercel-build.mjs.
const WORKER_LEASE_MS = 3 * 60_000

export class FirebaseDuplicateScanRepository implements DuplicateScanRepository {
  constructor(private readonly database: Database, private readonly mutateList: MutateList) {}

  async withWorkerLease<T>(workerId: string, now: Date, run: () => Promise<T>): Promise<T | null> {
    const lock = this.database.ref('duplicate_scan_worker_state/lease')
    const nowMs = now.getTime()
    const result = await lock.transaction((current) =>
      typeof current?.until === 'number' && current.until > nowMs
        ? undefined
        : { workerId, until: nowMs + WORKER_LEASE_MS }, undefined, false)
    if (!result.committed) return null
    try {
      return await run()
    } finally {
      await lock.transaction((current) => current === null || current.workerId === workerId ? null : undefined, undefined, false)
    }
  }

  async backfillBatch(cursor: DuplicateBackfillCursor | null, nowIso: string) {
    let listId = cursor?.itemId ? cursor.listId : undefined
    if (!listId) {
      const lists = this.database.ref('users').orderByKey()
      const page = await (cursor ? lists.startAfter(cursor.listId) : lists).limitToFirst(1).get()
      page.forEach((child) => { listId = child.key ?? undefined })
    }
    if (!listId) return { nextCursor: null, queued: 0 }

    const nextList = { listId }
    if (!safeSegment(listId)) return { nextCursor: nextList, queued: 0 }
    const list = this.database.ref(`users/${listId}`)
    const groceries = list.child('groceries').orderByKey()
    const page = await (cursor?.itemId ? groceries.startAfter(cursor.itemId) : groceries).limitToFirst(BACKFILL_PAGE_SIZE + 1).get()
    const itemIds: string[] = []
    page.forEach((child) => { if (child.key !== null) itemIds.push(child.key) })
    const batch = itemIds.slice(0, BACKFILL_PAGE_SIZE)
    let queued = 0
    if (batch.length > 0) {
      // Register before the list transaction so an interrupted invocation cannot strand jobs.
      await this.database.ref(`duplicate_scan_lists/${listId}`)
        .transaction((current) => current === null ? { listId } : undefined, undefined, false)
      queued = await this.mutateList(listId, (household) => {
        const records = object(household.groceries)
        const jobs: RecordNode = Object.assign(Object.create(null), object(household.duplicate_scan_jobs))
        const ready: RecordNode = Object.assign(Object.create(null), object(household.duplicate_scan_ready))
        let count = 0
        for (const itemId of batch) {
          const grocery = object(records[itemId])
          if (!safeSegment(itemId) || scalar(grocery.bought) !== false || typeof scalar(grocery.item) !== 'string' ||
            Object.hasOwn(jobs, itemId)) continue
          const marker = { itemId, algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION, createdAt: nowIso }
          jobs[itemId] = { ...marker, status: 'pending', attempts: 0, updatedAt: nowIso }
          ready[itemId] = updateFields(object(ready[itemId]), marker)
          count += 1
        }
        if (!count) return undefined
        return { value: { ...household, duplicate_scan_jobs: jobs, duplicate_scan_ready: ready }, result: count }
      }) ?? 0
    }
    return { nextCursor: itemIds.length > BACKFILL_PAGE_SIZE ? { listId, itemId: batch[BACKFILL_PAGE_SIZE - 1] } : nextList, queued }
  }

  async findReadyJobs(nowIso: string, limit: number): Promise<DuplicateScanJobRef[]> {
    void nowIso
    const boundedLimit = Math.max(1, limit)
    const cursorRef = this.database.ref('duplicate_scan_worker_state/cursor')
    const cursorSnapshot = await cursorRef.get()
    const cursor = typeof cursorSnapshot.val() === 'string' ? cursorSnapshot.val() as string : null
    const registryRef = this.database.ref('duplicate_scan_lists')
    let query: Query = registryRef.orderByKey()
    if (cursor) query = query.startAfter(cursor)
    const page = await query.limitToFirst(boundedLimit).get()
    const registrations = !page.exists() && cursor ? await registryRef.orderByKey().limitToFirst(boundedLimit).get() : page
    const orderedRegistrations: Array<[string, StoredListRegistration]> = []
    // Iterate in the same key order as startAfter, including numeric Firebase keys.
    registrations.forEach((child) => { if (child.key !== null) orderedRegistrations.push([child.key, object(child.val())]) })

    const jobs: DuplicateScanJobRef[] = []
    let processedRegistryKey: string | null = null
    for (const [registryKey, registration] of orderedRegistrations) {
      processedRegistryKey = registryKey
      const listId = typeof registration.listId === 'string' ? registration.listId : registryKey
      if (!safeSegment(listId)) continue
      const readySnapshot = await this.database.ref(`users/${listId}/duplicate_scan_ready`)
        .orderByKey()
        .limitToFirst(boundedLimit - jobs.length)
        .get()
      readySnapshot.forEach((child) => {
        const itemId = child.key
        if (itemId !== null && safeSegment(itemId) && object(child.val()).algorithmVersion === DUPLICATE_SCAN_ALGORITHM_VERSION) {
          jobs.push({ listId, itemId })
        }
        return jobs.length >= boundedLimit
      })
      if (jobs.length >= boundedLimit) break
    }
    if (processedRegistryKey) await cursorRef.set(processedRegistryKey)
    return jobs
  }

  async claim(reference: DuplicateScanJobRef, workerId: string, nowIso: string, leaseUntilIso: string): Promise<ClaimedDuplicateScanJob | null> {
    assertReference(reference)
    return await this.mutateList<ClaimedDuplicateScanJob | null>(reference.listId, (list) => {
      const jobs = object(list.duplicate_scan_jobs)
      const readyJobs = { ...object(list.duplicate_scan_ready) }
      const current = object(jobs[reference.itemId])
      const clearReady = () => {
        if (!Object.hasOwn(readyJobs, reference.itemId)) return undefined
        delete readyJobs[reference.itemId]
        return { value: { ...list, duplicate_scan_ready: readyJobs }, result: null }
      }
      if (scalar(current.algorithmVersion) !== DUPLICATE_SCAN_ALGORITHM_VERSION) return clearReady()
      const storedAttempts = scalar(current.attempts)
      const currentAttempts = typeof storedAttempts === 'number' ? storedAttempts : 0
      const status = scalar(current.status)
      const leaseUntil = scalar(current.leaseUntil)
      const ready = status === 'pending' || status === 'failed' ||
        (status === 'running' && typeof leaseUntil === 'string' && leaseUntil <= nowIso)
      if (status === 'completed' || currentAttempts >= DUPLICATE_SCAN_MAX_ATTEMPTS) return clearReady()
      if (!ready) return undefined
      const attempts = currentAttempts + 1
      const nextJob = updateFields(current, {
        status: 'running', attempts, workerId, leaseUntil: leaseUntilIso, updatedAt: nowIso, errorCode: null
      })
      return {
        value: { ...list, duplicate_scan_jobs: { ...jobs, [reference.itemId]: nextJob } },
        result: { ...reference, workerId, attempts }
      }
    }) ?? null
  }

  async loadCandidates(listId: string): Promise<DuplicateCandidate[]> {
    if (!safeSegment(listId)) throw new ApplicationError('invalid_input', 'Invalid duplicate scan list reference')
    const snapshot = await this.database.ref(`users/${listId}/groceries`).get()
    return Object.entries(object(snapshot.val())).flatMap(([id, value]) => {
      const grocery = object(value)
      return typeof grocery.item === 'string' && typeof grocery.bought === 'boolean'
        ? [{ id, name: grocery.item, bought: grocery.bought }]
        : []
    })
  }

  async complete(job: ClaimedDuplicateScanJob, findings: DuplicateMatch[], nowIso: string): Promise<void> {
    assertReference(job)
    const committed = await this.mutateList(job.listId, (list) => {
      const jobs = object(list.duplicate_scan_jobs)
      const current = object(jobs[job.itemId])
      if (scalar(current.status) !== 'running' || scalar(current.workerId) !== job.workerId ||
        scalar(current.attempts) !== job.attempts) return undefined
      const groceries = object(list.groceries)
      const storedFindings = { ...object(list.duplicate_findings) }
      for (const finding of findings) {
        if (finding.itemIds.some((id) => scalar(object(groceries[id]).bought) !== false)) continue
        const existing = object(storedFindings[finding.findingId])
        const state = scalar(existing.state)
        if (state === 'ignored' || state === 'resolved' || state === 'deleting') continue
        const createdAt = scalar(existing.createdAt)
        // The finding ID is derived from the item IDs; keep the existing pair node and its metadata.
        storedFindings[finding.findingId] = updateFields({
          itemIds: finding.itemIds,
          ...existing
        }, {
          algorithmVersion: finding.algorithmVersion,
          reason: finding.reason,
          score: finding.score,
          state: state === 'read' ? 'read' : 'open',
          createdAt: typeof createdAt === 'string' ? createdAt : nowIso,
          updatedAt: nowIso
        })
      }
      const nextJob = updateFields(current, {
        status: 'completed', workerId: null, leaseUntil: null, updatedAt: nowIso, errorCode: null
      })
      const readyJobs = { ...object(list.duplicate_scan_ready) }
      delete readyJobs[job.itemId]
      return {
        value: {
          ...list,
          duplicate_scan_jobs: { ...jobs, [job.itemId]: nextJob },
          duplicate_scan_ready: readyJobs,
          duplicate_findings: storedFindings
        },
        result: true
      }
    })
    if (!committed) throw new ApplicationError('conflict', 'Duplicate scan lease was lost')
  }

  async fail(job: ClaimedDuplicateScanJob, errorCode: string, nowIso: string): Promise<void> {
    assertReference(job)
    await this.mutateList(job.listId, (list) => {
      const jobs = object(list.duplicate_scan_jobs)
      const readyJobs = { ...object(list.duplicate_scan_ready) }
      const current = object(jobs[job.itemId])
      if (scalar(current.status) !== 'running' || scalar(current.workerId) !== job.workerId ||
        scalar(current.attempts) !== job.attempts) return undefined
      const nextJob = updateFields(current, { status: 'failed', workerId: null, leaseUntil: null, errorCode, updatedAt: nowIso })
      if (job.attempts >= DUPLICATE_SCAN_MAX_ATTEMPTS) delete readyJobs[job.itemId]
      return {
        value: { ...list, duplicate_scan_jobs: { ...jobs, [job.itemId]: nextJob }, duplicate_scan_ready: readyJobs },
        result: true
      }
    })
  }
}

export const createFirebaseDuplicateScanRepository = (app: App, databaseUrl: string): FirebaseDuplicateScanRepository => {
  if (!databaseUrl.trim()) throw new ApplicationError('not_configured', 'FIREBASE_DATABASE_URL is required')
  return new FirebaseDuplicateScanRepository(getDatabaseWithUrl(databaseUrl, app), createListMutation(app, databaseUrl))
}
