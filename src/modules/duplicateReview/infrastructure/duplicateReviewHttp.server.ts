import '@tanstack/react-start/server-only'
import type { AuthenticatedUserHandler } from '../../identity/server'
import { parseJsonRequest } from '../../identity/server'
import type { DuplicateReviewAction, DuplicateReviewService } from '../application/duplicateReview.service'
export type DuplicateReviewHttpDependencies = { authenticatedUserHandler: AuthenticatedUserHandler; service: DuplicateReviewService }
export const createDuplicateReviewListHandler = (d: DuplicateReviewHttpDependencies) => ({ request, listId }: { request: Request; listId: string }) => d.authenticatedUserHandler.handle(request, () => undefined, async (context) => Response.json(await d.service.list(context, listId)))
export const createDuplicateReviewActionHandler = (d: DuplicateReviewHttpDependencies) => ({ request, listId, findingId }: { request: Request; listId: string; findingId: string }) => d.authenticatedUserHandler.handle(request, parseJsonRequest<DuplicateReviewAction>, async (context, input) => { await d.service.act(context, listId, findingId, input); return new Response(null, { status: 204 }) })
