import { createFileRoute } from '@tanstack/react-router'

import { getAuthenticatedUserHandler, getScanReceiptFileService } from '../../modules/composition.server'
import type { ScanReceiptFileService } from '../../modules/receipts'
import { parseJsonRequest, type AuthenticatedUserHandler } from '../../modules/identity/server'

export const createScanReceiptFileHandler = (dependencies: {
  authenticatedUserHandler: AuthenticatedUserHandler
  service: ScanReceiptFileService
}) => async ({ request }: { request: Request }): Promise<Response> =>
  dependencies.authenticatedUserHandler.handle(
    request,
    parseJsonRequest,
    async (context, input) => {
      const result = await dependencies.service.execute(context, input as Record<string, unknown>)
      return Response.json(result.body, { status: result.status })
    }
  )

export const Route = createFileRoute('/api/scan-receipt')({
  server: { handlers: { POST: ({ request }) => createScanReceiptFileHandler({
    authenticatedUserHandler: getAuthenticatedUserHandler(), service: getScanReceiptFileService()
  })({ request }) } }
})
