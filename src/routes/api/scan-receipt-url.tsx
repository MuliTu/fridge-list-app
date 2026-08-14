import { createFileRoute } from '@tanstack/react-router'

import { getAuthenticatedUserHandler, getScanReceiptUrlService } from '../../modules/composition.server'
import { parseJsonRequest, type AuthenticatedUserHandler } from '../../modules/identity/server'
import type { ScanReceiptUrlService } from '../../modules/receipts'

export const createScanReceiptUrlHandler = (dependencies: {
  authenticatedUserHandler: AuthenticatedUserHandler
  service: ScanReceiptUrlService
}) => async ({ request }: { request: Request }): Promise<Response> =>
  dependencies.authenticatedUserHandler.handle(
    request,
    parseJsonRequest,
    async (context, input) => {
      const result = await dependencies.service.execute(context, input as Record<string, unknown>)
      return Response.json(result.body, { status: result.status })
    }
  )

export const Route = createFileRoute('/api/scan-receipt-url')({
  server: { handlers: { POST: ({ request }) => createScanReceiptUrlHandler({
    authenticatedUserHandler: getAuthenticatedUserHandler(), service: getScanReceiptUrlService()
  })({ request }) } }
})
