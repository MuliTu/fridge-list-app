import { getCurrentUserIdToken } from '../../lib/firebase'
import type { AiAssistantRequest, AiAssistantResult } from '../../modules/ai'

export class AiAssistantApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'AiAssistantApiError'
  }
}

export interface AiAssistantResponse {
  result: AiAssistantResult
  ignoredCorrectionCount: number
}

export const analyzeWithAi = async (
  input: AiAssistantRequest,
  fetchImplementation: typeof fetch = fetch
): Promise<AiAssistantResponse> => {
  const token = await getCurrentUserIdToken()
  const response = await fetchImplementation('/api/ai/analyze', {
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
      body.error?.message ?? 'AI assistant request failed'
    )
  }
  return {
    result: body.result,
    ignoredCorrectionCount: body.ignoredCorrectionCount ?? 0
  }
}

