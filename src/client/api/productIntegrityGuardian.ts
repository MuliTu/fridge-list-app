import type { GuardianContext, SemanticGroceryMatchResult } from '../../modules/groceries'

export type GuardianRequest = {
  listId: string
  query: string
  guardian: GuardianContext
}

export const requestGuardianDecision = async (
  { listId, query, guardian }: GuardianRequest,
  signal: AbortSignal
): Promise<SemanticGroceryMatchResult> => {
  const { getCurrentUserIdToken } = await import('../../lib/firebase')
  if (signal.aborted) throw signal.reason
  const token = await getCurrentUserIdToken()
  if (!token) throw new Error('Missing grocery match authorization')
  const response = await fetch(`/api/lists/${encodeURIComponent(listId)}/groceries/matches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, guardian }),
    signal
  })
  if (!response.ok) throw new Error('Grocery match unavailable')
  return response.json()
}
