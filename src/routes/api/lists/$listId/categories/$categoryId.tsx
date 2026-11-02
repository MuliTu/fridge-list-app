import { createFileRoute } from '@tanstack/react-router'

import { getAuthenticatedUserHandler, getCatalogCommandService } from '../../../../../modules/composition.server'
import { createCategoryItemDeleteHandler, createCategoryItemPatchHandler } from '../../../../../modules/catalog/server'

const dependencies = () => ({ authenticatedUserHandler: getAuthenticatedUserHandler(), service: getCatalogCommandService() })

export const Route = createFileRoute('/api/lists/$listId/categories/$categoryId')({
  server: { handlers: {
    PATCH: ({ request, params }) => createCategoryItemPatchHandler(dependencies())({ request, listId: params.listId, categoryId: params.categoryId }),
    DELETE: ({ request, params }) => createCategoryItemDeleteHandler(dependencies())({ request, listId: params.listId, categoryId: params.categoryId })
  } }
})
