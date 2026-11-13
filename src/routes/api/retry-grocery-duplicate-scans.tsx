import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'
import { processDuplicateScanJobs, type DuplicateScanRepository } from '../../modules/groceries'
import { createFirebaseDuplicateScanRepository, type FirebaseDuplicateScanRepository } from '../../modules/groceries/server'
import { getFirebaseAdminApp } from '../../modules/identity/server'

type DuplicateScanHandlerDependencies = {
  repository: DuplicateScanRepository & Pick<FirebaseDuplicateScanRepository, 'backfillBatch' | 'withWorkerLease'>
  now: () => Date
  createWorkerId: () => string
}

const isFirebaseKey = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 768 &&
  !/[.#$/[\]\u0000-\u001f\u007f]/.test(value)

const parseCursor = async (request: Request): Promise<{ listId: string; itemId?: string } | null | undefined> => {
  const body: unknown = await request.json().catch(() => undefined)
  if (body === null) return null
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined
  const { listId, itemId } = body as { listId?: unknown; itemId?: unknown }
  if (!isFirebaseKey(listId) || (itemId !== undefined && !isFirebaseKey(itemId))) return undefined
  return itemId === undefined ? { listId } : { listId, itemId }
}

export const createDuplicateScanGetHandler = (dependencies?: DuplicateScanHandlerDependencies) =>
  async ({ request }: { request: Request }): Promise<Response> => {
    const cronSecret = process.env.CRON_SECRET?.trim()
    if (!cronSecret) return Response.json({ error: true, message: 'not_configured' }, { status: 500 })
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return Response.json({ error: true, message: 'unauthorized' }, { status: 401 })
    }

    try {
      const backfill = request.method === 'POST'
      const cursor = backfill ? await parseCursor(request) : null
      if (cursor === undefined) return Response.json({ error: true, message: 'invalid_cursor' }, { status: 400 })

      const resolved = dependencies ?? (() => {
        const databaseUrl = process.env.FIREBASE_DATABASE_URL?.trim()
        if (!databaseUrl) throw new Error('database_not_configured')
        return {
          repository: createFirebaseDuplicateScanRepository(getFirebaseAdminApp(process.env), databaseUrl),
          now: () => new Date(),
          createWorkerId: randomUUID
        }
      })()
      const { repository } = resolved
      const now = resolved.now()
      const workerId = resolved.createWorkerId()
      const result = await repository.withWorkerLease(workerId, now, async () => {
        if (backfill) return { backfill: await repository.backfillBatch(cursor, now.toISOString()) }
        const counts = await processDuplicateScanJobs(repository, { now, workerId, limit: 10 })
        logger.success(`[duplicate-scan] completed=${counts.completed} failed=${counts.failed} claimed=${counts.claimed}`)
        return counts
      })
      if (!result) return Response.json({ error: true, message: 'worker_busy' }, { status: 409 })
      return Response.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
    } catch {
      logger.error('[duplicate-scan] worker invocation failed')
      return Response.json({ error: true, message: 'worker_failed' }, { status: 503 })
    }
  }

const handleDuplicateScan = createDuplicateScanGetHandler()
export const Route = createFileRoute('/api/retry-grocery-duplicate-scans')({
  server: { handlers: { GET: handleDuplicateScan, POST: handleDuplicateScan } }
})
