import { useEffect, useState } from 'react'

import { requestGuardianDecision, type GuardianRequest } from '../client/api/productIntegrityGuardian'
import type { ProductIntegrityGuardianDecision } from '../modules/groceries'

export function useProductIntegrityGuardian(request: GuardianRequest | null) {
  const body = request && request.query.length <= 120 ? JSON.stringify(request) : null
  const [resolved, setResolved] = useState<{
    body: string
    decision: ProductIntegrityGuardianDecision
  } | null>(null)

  useEffect(() => {
    setResolved(null)
    if (!body) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void requestGuardianDecision(JSON.parse(body), controller.signal).then((result) => {
        if (!controller.signal.aborted && result.status === 'ok' && result.decision) {
          setResolved({ body, decision: result.decision })
        }
      }).catch(() => {})
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [body])

  return resolved?.body === body ? resolved.decision : undefined
}
