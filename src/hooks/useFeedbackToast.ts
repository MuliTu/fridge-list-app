import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouterState } from '@tanstack/react-router'
import { submitFeedback } from '../lib/firebase'
import { useAuth } from './AuthContext'

export type FeedbackToastStatus = 'pending' | 'success' | 'error'

export type FeedbackToast = {
  // Monotonic id so a second submission supersedes the first one's late-arriving
  // result instead of clobbering the newer toast (the n8n round-trip can take ~30s).
  id: number
  status: FeedbackToastStatus
}

/**
 * Owns the non-blocking feedback submission: the caller fires `submit(text)` and
 * immediately closes the form, and this hook drives a transient status toast
 * (pending → success/error) that outlives the now-closed modal. Kept as a hook
 * (not inlined in Layout) so the submit/notify logic is unit-testable in isolation,
 * and deliberately not a context — it's read by exactly one owner (Layout), so the
 * `shared, live, cross-component` bar for adding a context here isn't met.
 */
export const useFeedbackToast = () => {
  const { i18n } = useTranslation()
  const { user } = useAuth()
  const route = useRouterState({ select: (s) => s.location.pathname })
  const [toast, setToast] = useState<FeedbackToast | null>(null)

  const dismiss = useCallback(() => setToast(null), [])

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      // The modal already blocks empty submits, but guard here too so the hook is
      // safe to call directly — never show a "sending" toast for nothing.
      if (!trimmed) return
      const id = Date.now()
      setToast({ id, status: 'pending' })
      const result = await submitFeedback({
        request: trimmed,
        route,
        user,
        language: i18n.language
      })
      // Only resolve the toast we started — if the user fired another feedback
      // submission in the meantime, that newer pending toast wins.
      setToast((current) =>
        current && current.id === id
          ? { id, status: result.error ? 'error' : 'success' }
          : current
      )
    },
    [route, user, i18n.language]
  )

  return { toast, submit, dismiss }
}
