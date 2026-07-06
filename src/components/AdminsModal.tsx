import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ADMIN_EMAILS, addAdminEmail, adminsRef, onValue, removeAdminEmail } from '../lib/firebase'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface AdminsModalProps {
  onClose: () => void
}

export default function AdminsModal({ onClose }: AdminsModalProps) {
  const { t } = useTranslation()
  const [invitedEmails, setInvitedEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => onValue(adminsRef, (snapshot) => setInvitedEmails(Object.values(snapshot.val() || {}))), [])

  const handleAdd = async () => {
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) {
      setError(t('admins:invalidEmail'))
      return
    }
    setError(null)
    try {
      await addAdminEmail(trimmed)
      setNewEmail('')
    } catch (err: any) {
      setError(`${t('admins:addFailed')}: ${err.message}`)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admins:title')}</DialogTitle>
        </DialogHeader>
        <p className="modal-note-readonly">{t('admins:explanation')}</p>

        <div className="category-rows">
          {ADMIN_EMAILS.map((email) => (
            <div className="category-row" key={email}>
              <span className="admin-email">{email}</span>
              <span className="admin-owner-tag">{t('admins:ownerTag')}</span>
            </div>
          ))}
          {invitedEmails.map((email) => (
            <div className="category-row" key={email}>
              <span className="admin-email">{email}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-[26px] w-[26px]"
                onClick={() => removeAdminEmail(email)}
                aria-label={t('admins:removeAdmin')}
              >
                🗑
              </Button>
            </div>
          ))}
        </div>

        <div className="category-row">
          <Input
            type="email"
            placeholder={t('admins:emailPlaceholder')}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-[26px] w-[26px]"
            onClick={handleAdd}
            aria-label={t('admins:addAdmin')}
          >
            ➕
          </Button>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <DialogFooter>
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
