import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'
import { getN8nGroceryWriteDependencies } from '../../modules/composition.server'
import { ApplicationError } from '../../modules/shared'
import { toHttpErrorResponse } from '../../modules/shared/server'

export const Route = createFileRoute('/api/n8n-write-groceries')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { authenticateRequest, service } = getN8nGroceryWriteDependencies()
          const context = authenticateRequest(request.headers)
          const { principal } = context
          const allowedListId = principal.allowedListIds.values().next().value
          if (!allowedListId || !principal.scopes.includes('groceries:write')) {
            throw new ApplicationError('forbidden', 'Machine principal cannot write groceries')
          }

          let body: Record<string, unknown>
          try {
            const value = await request.json()
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
              throw new Error('body must be an object')
            }
            body = value as Record<string, unknown>
          } catch {
            throw new ApplicationError('invalid_input', 'invalid JSON body')
          }

          const command =
            body.action === 'insert'
              ? {
                  action: 'insert' as const,
                  item: body.item,
                  category: body.category,
                  added_at: body.added_at,
                  raw_text: body.raw_text,
                  created_by: body.created_by,
                  idempotency_key: request.headers.get('x-idempotency-key') ?? body.idempotency_key
                }
              : body.action === 'update'
                ? { action: 'update' as const, key: body.key, added_at: body.added_at }
                : (() => {
                    throw new ApplicationError('invalid_input', 'action must be "insert" or "update"')
                  })()

          const result = await service.execute(allowedListId, command)
          logger.success(
            `[n8n-write-groceries] request=${context.requestId} ${result.action} completed key=${result.key}`
          )
          return Response.json({ success: true, ...result })
        } catch (error) {
          if (error instanceof ApplicationError && error.code === 'unauthenticated') {
            logger.warn('[n8n-write-groceries] request rejected: invalid or missing machine credentials')
          } else {
            logger.error('[n8n-write-groceries] request failed')
          }
          return toHttpErrorResponse(error)
        }
      }
    }
  }
})
