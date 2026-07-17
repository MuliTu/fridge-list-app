import { useTranslation } from 'react-i18next'
import { useWhatsNew } from '../hooks/useWhatsNew'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

interface WhatsNewModalProps {
  onClose: () => void
}

// Unlike ChangelogModal (full engineer-facing release history, untranslated), this
// shows just the current version's highlights in plain language — sourced from a
// single global `/whats_new` object (see WhatsNew in types.ts), not translated per
// this app's existing convention for freeform dynamic content (category/list names,
// item notes) that isn't backed by fixed i18n keys.
export default function WhatsNewModal({ onClose }: WhatsNewModalProps) {
  const { t } = useTranslation('whatsNew')
  const { whatsNew } = useWhatsNew()

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        {!whatsNew ? (
          <p className="modal-note-readonly">{t('empty')}</p>
        ) : (
          <>
            <p className="modal-note-readonly">{t('versionLabel', { version: whatsNew.version })}</p>
            <ul className="list-disc ps-5">
              {whatsNew.updates.map((update, i) => (
                <li key={i}>{update}</li>
              ))}
            </ul>
          </>
        )}

        <DialogFooter>
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
