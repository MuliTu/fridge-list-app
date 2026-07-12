import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addListMember, listMembersRef, onValue, removeListMember } from '../lib/firebase'
import { useAuth } from '../hooks/AuthContext'
import { useActiveList } from '../hooks/ListContext'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface ListMembersModalProps {
  onClose: () => void
}

// Per-list membership, replacing the old app-wide AdminsModal — invites now grant
// access to this one list only, not the whole app (see src/hooks/ListContext.tsx).
export default function ListMembersModal({ onClose }: ListMembersModalProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { activeList, isOwner } = useActiveList()
  const [members, setMembers] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [emailWarning, setEmailWarning] = useState<string | null>(null)

  useEffect(() => {
    if (!activeList) return
    return onValue(listMembersRef(activeList.id), (snapshot) => setMembers(Object.values(snapshot.val() || {})))
  }, [activeList?.id])

  if (!activeList) return null

  const handleAdd = async () => {
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) {
      setError(t('admins:invalidEmail'))
      return
    }
    setError(null)
    setEmailWarning(null)
    try {
      // Best-effort — the invite itself (addListMember's Firebase write) already
      // succeeded before the email send is even attempted, so a delivery failure
      // (e.g. SMTP not configured yet) never blocks or reverts the actual grant.
      const result = await addListMember(activeList.id, activeList.name, activeList.owner, trimmed, user?.email)
      setNewEmail('')
      if (result.error) setEmailWarning(t('admins:emailNotSent'))
    } catch (err: any) {
      setError(`${t('admins:addFailed')}: ${err.message}`)
    }
  }

  const handleRemove = async (email: string) => {
    try {
      await removeListMember(activeList.id, email)
    } catch (err: any) {
      setError(`${t('admins:addFailed')}: ${err.message}`)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admins:titleForList', { listName: activeList.name })}</DialogTitle>
        </DialogHeader>
        <p className="modal-note-readonly">{t('admins:explanation')}</p>

        <div className="category-rows">
          {members.map((email) => (
            <div className="category-row" key={email}>
              <span className="admin-email">{email}</span>
              {email === activeList.owner ? (
                <span className="admin-owner-tag">{t('admins:ownerTag')}</span>
              ) : (
                isOwner && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-[26px] w-[26px]"
                    onClick={() => handleRemove(email)}
                    aria-label={t('admins:removeAdmin')}
                  >
                    🗑
                  </Button>
                )
              )}
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
        {emailWarning && <div className="text-sm text-muted-foreground">{emailWarning}</div>}

        <DialogFooter>
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
