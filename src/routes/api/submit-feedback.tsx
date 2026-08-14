import { createFileRoute } from '@tanstack/react-router'

import {
  getAuthenticatedUserHandler,
  getSubmitFeedbackService
} from '../../modules/composition.server'
import type { SubmitFeedbackService } from '../../modules/feedback'
import { parseJsonRequest, type AuthenticatedUserHandler } from '../../modules/identity/server'

type SubmitFeedbackRouteDependencies = {
  authenticatedUserHandler: AuthenticatedUserHandler
  submitFeedback: SubmitFeedbackService
}

export const createSubmitFeedbackHandler =
  (dependencies: SubmitFeedbackRouteDependencies) =>
  async ({ request }: { request: Request }): Promise<Response> =>
    dependencies.authenticatedUserHandler.handle(
      request,
      parseJsonRequest,
      async (context, input) =>
        Response.json(await dependencies.submitFeedback.execute(context, input))
    )

export const Route = createFileRoute('/api/submit-feedback')({
  server: {
    handlers: {
      POST: ({ request }) =>
        createSubmitFeedbackHandler({
          authenticatedUserHandler: getAuthenticatedUserHandler(),
          submitFeedback: getSubmitFeedbackService()
        })({ request })
    }
  }
})
