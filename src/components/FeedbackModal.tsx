import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouterState } from '@tanstack/react-router'
import { submitFeedback } from '../lib/firebase'
import { useAuth } from '../hooks/AuthContext'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

interface FeedbackModalProps {
  onClose: () => void
}

export default function FeedbackModal({ onClose }: FeedbackModalProps) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const currentRoute = useRouterState({ select: (s) => s.location.pathname })
  const [request, setRequest] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = request.trim()
    if (!trimmed) {
      setError(t('feedback:requestRequired'))
      return
    }
    // Guard against a double-submit while the request is in flight — a required
    // behavior from the spec, and cheap to enforce with the disabled/submitting flag.
    if (submitting) return
    setSubmitting(true)
    setError(null)
    const result = await submitFeedback({
      request: trimmed,
      route: currentRoute,
      user,
      language: i18n.language
    })
    setSubmitting(false)
    if (result.error) {
      setError(t('feedback:error'))
      return
    }
    setSubmitted(true)
  }

  const resetForAnother = () => {
    setRequest('')
    setSubmitted(false)
    setError(null)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('feedback:title')}</DialogTitle>
        </DialogHeader>

        {submitted ? (
          <>
            <p className="modal-note-readonly">{t('feedback:success')}</p>
            <DialogFooter>
              <Button variant="ghost" onClick={resetForAnother}>
                {t('feedback:sendAnother')}
              </Button>
              <Button onClick={onClose}>{t('common:actions.close')}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="modal-note-readonly">{t('feedback:explanation')}</p>
            <Textarea
              rows={5}
              placeholder={t('feedback:requestPlaceholder')}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              disabled={submitting}
              autoFocus
            />
            {error && <div className="text-sm text-destructive">{error}</div>}
            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                {t('common:actions.cancel')}
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? t('feedback:submitting') : t('feedback:submit')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
