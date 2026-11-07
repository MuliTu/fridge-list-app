import '@tanstack/react-start/server-only'

import { getDatabaseWithUrl, type Database, type Query } from 'firebase-admin/database'
import type { App } from 'firebase-admin/app'
import { ApplicationError } from '../../shared'
import {
  DUPLICATE_SCAN_ALGORITHM_VERSION,
  DUPLICATE_SCAN_MAX_ATTEMPTS,
  type ClaimedDuplicateScanJob,
  type DuplicateCandidate,
  type DuplicateMatch,
  type DuplicateScanJobRef,
  type DuplicateScanRepository
} from '../application/duplicateScan.service'

type StoredJob = {
  itemId?: unknown
  status?: unknown
  attempts?: unknown
  workerId?: unknown
  leaseUntil?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  algorithmVersion?: unknown
}
type StoredListRegistration = {
  listId?: unknown
}
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
const safeSegment = (value: string): boolean => Boolean(value) && value.length <= 200 &&
  value.trim() === value && !/[.#$/[\]\u0000-\u001f\u007f]/.test(value)
const assertReference = (reference: DuplicateScanJobRef): void => {
  if (!safeSegment(reference.listId) || !safeSegment(reference.itemId)) {
    throw new ApplicationError('invalid_input', 'Invalid duplicate scan job reference')
  }
}

export class FirebaseDuplicateScanRepository implements DuplicateScanRepository {
  constructor(private readonly database: Database) {}

  async findReadyJobs(nowIso: string, limit: number): Promise<DuplicateScanJobRef[]> {
    void nowIso
    const boundedLimit = Math.max(1, limit)
    const cursorRef = this.database.ref('duplicate_scan_worker_state/cursor')
    const cursorSnapshot = await cursorRef.get()
    const cursor = typeof cursorSnapshot.val() === 'string' ? cursorSnapshot.val() as string : null
    const registryRef = this.database.ref('duplicate_scan_lists')
    let query: Query = registryRef.orderByKey()
    if (cursor) query = query.startAfter(cursor)
    let registrations = Object.entries(object((await query.limitToFirst(boundedLimit).get()).val()))
    if (registrations.length === 0 && cursor) {
      registrations = Object.entries(object((await registryRef.orderByKey().limitToFirst(boundedLimit).get()).val()))
    }

    const jobs: DuplicateScanJobRef[] = []
    let processedRegistryKey: string | null = null
    for (const [registryKey, value] of registrations) {
      processedRegistryKey = registryKey
      const registration = object(value) as StoredListRegistration
      const listId = typeof registration.listId === 'string' ? registration.listId : registryKey
      if (!safeSegment(listId)) continue
      const readySnapshot = await this.database.ref(`users/${listId}/duplicate_scan_ready`)
        .orderByKey()
        .limitToFirst(boundedLimit - jobs.length)
        .get()
      for (const [itemId, readyValue] of Object.entries(object(readySnapshot.val()))) {
        const ready = object(readyValue)
        if (ready.algorithmVersion === DUPLICATE_SCAN_ALGORITHM_VERSION) jobs.push({ listId, itemId })
        if (jobs.length >= boundedLimit) break
      }
      if (jobs.length >= boundedLimit) break
    }
    if (processedRegistryKey) await cursorRef.set(processedRegistryKey)
    return jobs
  }

  async claim(reference: DuplicateScanJobRef, workerId: string, nowIso: string, leaseUntilIso: string): Promise<ClaimedDuplicateScanJob | null> {
    assertReference(reference)
    let attempts = 0
    let terminal = false
    const result = await this.database.ref(`users/${reference.listId}`).transaction((value: Record<string, any> | null) => {
      const list = object(value)
      const jobs = object(list.duplicate_scan_jobs)
      const readyJobs = object(list.duplicate_scan_ready)
      const stored = jobs[reference.itemId]
      const current = object(stored) as StoredJob
      if (!stored || current.algorithmVersion !== DUPLICATE_SCAN_ALGORITHM_VERSION) {
        delete readyJobs[reference.itemId]
        terminal = true
        return { ...list, duplicate_scan_ready: readyJobs }
      }
      const currentAttempts = typeof current.attempts === 'number' ? current.attempts : 0
      const ready = current.status === 'pending' || current.status === 'failed' ||
        (current.status === 'running' && typeof current.leaseUntil === 'string' && current.leaseUntil <= nowIso)
      if (!ready || currentAttempts >= DUPLICATE_SCAN_MAX_ATTEMPTS) {
        if (current.status === 'completed' || currentAttempts >= DUPLICATE_SCAN_MAX_ATTEMPTS) {
          delete readyJobs[reference.itemId]
          terminal = true
          return { ...list, duplicate_scan_ready: readyJobs }
        }
        return undefined
      }
      attempts = currentAttempts + 1
      jobs[reference.itemId] = {
        ...current,
        status: 'running',
        attempts,
        workerId,
        leaseUntil: leaseUntilIso,
        updatedAt: nowIso,
        errorCode: null
      }
      return { ...list, duplicate_scan_jobs: jobs, duplicate_scan_ready: readyJobs }
    })
    if (!result.committed) {
      return null
    }
    if (terminal) return null
    return { ...reference, workerId, attempts }
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
    let lostLease = false
    const result = await this.database.ref(`users/${job.listId}`).transaction((value: Record<string, any> | null) => {
      const list = object(value)
      const jobs = object(list.duplicate_scan_jobs)
      const current = object(jobs[job.itemId])
      if (current.status !== 'running' || current.workerId !== job.workerId || current.attempts !== job.attempts) {
        lostLease = true
        return undefined
      }
      const storedFindings = object(list.duplicate_findings)
      for (const finding of findings) {
        const existing = object(storedFindings[finding.findingId])
        if (existing.state === 'ignored' || existing.state === 'resolved') continue
        storedFindings[finding.findingId] = {
          itemIds: finding.itemIds,
          algorithmVersion: finding.algorithmVersion,
          reason: finding.reason,
          score: finding.score,
          state: existing.state === 'read' ? 'read' : 'open',
          createdAt: typeof existing.createdAt === 'string' ? existing.createdAt : nowIso,
          updatedAt: nowIso
        }
      }
      jobs[job.itemId] = { ...current, status: 'completed', workerId: null, leaseUntil: null, updatedAt: nowIso, errorCode: null }
      const readyJobs = object(list.duplicate_scan_ready)
      delete readyJobs[job.itemId]
      return { ...list, duplicate_scan_jobs: jobs, duplicate_scan_ready: readyJobs, duplicate_findings: storedFindings }
    })
    if (!result.committed || lostLease) throw new ApplicationError('conflict', 'Duplicate scan lease was lost')
  }

  async fail(job: ClaimedDuplicateScanJob, errorCode: string, nowIso: string): Promise<void> {
    assertReference(job)
    await this.database.ref(`users/${job.listId}`).transaction((value: Record<string, any> | null) => {
      const list = object(value)
      const jobs = object(list.duplicate_scan_jobs)
      const readyJobs = object(list.duplicate_scan_ready)
      const stored = jobs[job.itemId]
      const current = object(stored) as StoredJob
      if (!stored || current.status !== 'running' || current.workerId !== job.workerId || current.attempts !== job.attempts) return undefined
      jobs[job.itemId] = { ...current, status: 'failed', workerId: null, leaseUntil: null, errorCode, updatedAt: nowIso }
      if (job.attempts >= DUPLICATE_SCAN_MAX_ATTEMPTS) delete readyJobs[job.itemId]
      return { ...list, duplicate_scan_jobs: jobs, duplicate_scan_ready: readyJobs }
    })
  }
}

export const createFirebaseDuplicateScanRepository = (app: App, databaseUrl: string): DuplicateScanRepository => {
  if (!databaseUrl.trim()) throw new ApplicationError('not_configured', 'FIREBASE_DATABASE_URL is required')
  return new FirebaseDuplicateScanRepository(getDatabaseWithUrl(databaseUrl, app))
}
