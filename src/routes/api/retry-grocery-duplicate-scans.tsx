import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'
import { processDuplicateScanJobs, type DuplicateScanRepository } from '../../modules/groceries'
import { createFirebaseDuplicateScanRepository } from '../../modules/groceries/server'
import { getFirebaseAdminApp } from '../../modules/identity/server'

type DuplicateScanHandlerDependencies = {
  repository: DuplicateScanRepository
  now: () => Date
  createWorkerId: () => string
}

export const createDuplicateScanGetHandler = (dependencies?: DuplicateScanHandlerDependencies) =>
  async ({ request }: { request: Request }): Promise<Response> => {
    const cronSecret = process.env.CRON_SECRET?.trim()
    if (!cronSecret) return Response.json({ error: true, message: 'not_configured' }, { status: 500 })
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return Response.json({ error: true, message: 'unauthorized' }, { status: 401 })
    }

    try {
      const resolved = dependencies ?? (() => {
        const databaseUrl = process.env.FIREBASE_DATABASE_URL?.trim()
        if (!databaseUrl) throw new Error('database_not_configured')
        return {
          repository: createFirebaseDuplicateScanRepository(getFirebaseAdminApp(process.env), databaseUrl),
          now: () => new Date(),
          createWorkerId: randomUUID
        }
      })()
      const result = await processDuplicateScanJobs(resolved.repository, {
        now: resolved.now(),
        workerId: resolved.createWorkerId(),
        limit: 10
      })
      logger.success(`[duplicate-scan] completed=${result.completed} failed=${result.failed} claimed=${result.claimed}`)
      return Response.json({ ok: true, ...result })
    } catch {
      logger.error('[duplicate-scan] worker invocation failed')
      return Response.json({ error: true, message: 'worker_failed' }, { status: 503 })
    }
  }

export const Route = createFileRoute('/api/retry-grocery-duplicate-scans')({
  server: { handlers: { GET: createDuplicateScanGetHandler() } }
})
