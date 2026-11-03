import { getCurrentUserIdToken } from '../../lib/firebase'
import type { ShoppingShareSnapshot, ShoppingShareSummary } from '../../modules/shoppingSharing'

export async function shoppingSharingRequest<T>(input?: unknown, signal?: AbortSignal): Promise<T> {
  const token = await getCurrentUserIdToken()
  const response = await fetch('/api/shopping-sharing', {
    method: input ? 'POST' : 'GET', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(input ? { body: JSON.stringify(input) } : {})
  })
  if (!response.ok) throw new Error(String(response.status))
  return response.json()
}

export const discoverShoppingShares = (signal?: AbortSignal) => shoppingSharingRequest<ShoppingShareSummary[]>(undefined, signal)
export const getShoppingShare = (shareId: string, signal?: AbortSignal) => shoppingSharingRequest<ShoppingShareSnapshot>({ action: 'snapshot', shareId }, signal)
