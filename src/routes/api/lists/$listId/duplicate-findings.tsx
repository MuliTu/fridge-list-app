import { createFileRoute } from '@tanstack/react-router'
import { getAuthenticatedUserHandler, getDuplicateReviewService } from '../../../../modules/composition.server'
import { createDuplicateReviewListHandler } from '../../../../modules/duplicateReview/server'
export const Route = createFileRoute('/api/lists/$listId/duplicate-findings')({ server: { handlers: { GET: ({ request, params }) => createDuplicateReviewListHandler({ authenticatedUserHandler: getAuthenticatedUserHandler(), service: getDuplicateReviewService() })({ request, listId: params.listId }) } } })
