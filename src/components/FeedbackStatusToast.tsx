import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { FeedbackToast } from '../hooks/useFeedbackToast'

// Terminal (success/error) toasts auto-dismiss; the pending toast stays until the
// n8n round-trip resolves so the user always sees a final outcome.
const AUTO_DISMISS_MS = 4500

type FeedbackStatusToastProps = {
  toast: FeedbackToast | null
  onDismiss: () => void
}

export const FeedbackStatusToast = ({ toast, onDismiss }: FeedbackStatusToastProps) => {
  const { t } = useTranslation()
  const id = toast?.id
  const status = toast?.status

  useEffect(() => {
    if (!status || status === 'pending') return
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
    // Keyed on id+status (primitives that actually change), not the toast object.
    // onDismiss is a stable useCallback from useFeedbackToast, so it's safe to depend on.
  }, [id, status, onDismiss])

  if (!toast) return null

  const message =
    toast.status === 'pending'
      ? t('feedback:statusPending')
      : toast.status === 'success'
        ? t('feedback:success')
        : t('feedback:error')

  return (
    // aria-live=polite + role=status so screen readers announce the outcome without
    // stealing focus; pointer-events:none (in CSS) keeps it truly non-blocking.
    <div className={`feedback-toast feedback-toast-${toast.status}`} role="status" aria-live="polite">
      {toast.status === 'pending' && <span className="feedback-toast-spinner" aria-hidden="true" />}
      <span>{message}</span>
    </div>
  )
}
