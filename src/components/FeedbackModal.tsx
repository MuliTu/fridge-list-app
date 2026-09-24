import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

type FeedbackModalProps = {
  onClose: () => void
  // Fires the (already non-empty, trimmed) request. The parent submits it in the
  // background and drives the status toast — the modal never awaits the network.
  onSubmit: (request: string) => void
}

export const FeedbackModal = ({ onClose, onSubmit }: FeedbackModalProps) => {
  const { t } = useTranslation()
  const [request, setRequest] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    const trimmed = request.trim()
    if (!trimmed) {
      setError(t('feedback:requestRequired'))
      return
    }
    // Non-blocking by design: hand the request off and close immediately so the
    // user can keep using the app. Status is confirmed via the toast, not here.
    onSubmit(trimmed)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('feedback:title')}</DialogTitle>
        </DialogHeader>

        <p className="modal-note-readonly">{t('feedback:explanation')}</p>
        <Textarea
          rows={5}
          placeholder={t('feedback:requestPlaceholder')}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          autoFocus
        />
        {error && <div className="text-sm text-destructive">{error}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSubmit}>{t('feedback:submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
