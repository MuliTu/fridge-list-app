import { createFileRoute } from '@tanstack/react-router'
import { getAuthenticatedUserHandler, getDuplicateReviewService } from '../../../../../modules/composition.server'
import { createDuplicateReviewActionHandler } from '../../../../../modules/duplicateReview/server'
export const Route = createFileRoute('/api/lists/$listId/duplicate-findings/$findingId')({ server: { handlers: { PATCH: ({ request, params }) => createDuplicateReviewActionHandler({ authenticatedUserHandler: getAuthenticatedUserHandler(), service: getDuplicateReviewService() })({ request, listId: params.listId, findingId: params.findingId }) } } })
