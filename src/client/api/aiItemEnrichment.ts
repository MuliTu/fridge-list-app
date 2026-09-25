import { getCurrentUserIdToken } from '../../lib/firebase'
import type { AiItemEnrichmentRequest, AiItemEnrichmentResult } from '../../modules/ai'
import { AiAssistantApiError } from './aiAssistant'

export const enrichItemsWithAi = async (
  input: AiItemEnrichmentRequest,
  fetchImplementation: typeof fetch = fetch
): Promise<AiItemEnrichmentResult> => {
  const token = await getCurrentUserIdToken()
  const response = await fetchImplementation('/api/ai/enrich-items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(input)
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.result) {
    throw new AiAssistantApiError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? 'AI item assistant request failed'
    )
  }
  return body.result
}
