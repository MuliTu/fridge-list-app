import { createFileRoute } from '@tanstack/react-router'
import { handleShoppingSharing } from '../../modules/shoppingSharing/server'

export const Route = createFileRoute('/api/shopping-sharing')({
  server: { handlers: {
    GET: ({ request }) => handleShoppingSharing(request),
    POST: ({ request }) => handleShoppingSharing(request)
  } }
})
