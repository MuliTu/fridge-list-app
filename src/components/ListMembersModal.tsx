import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { inviteToList, invitesRef, onValue, removeListMember, type InviteEntry } from '../lib/firebase'
import { useAuth } from '../hooks/AuthContext'
import { useActiveList } from '../hooks/ListContext'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'

type ListMembersModalProps = {
  onClose: () => void
}

// Per-list membership, replacing the old app-wide AdminsModal — invites now grant
// access to this one list only, not the whole app (see src/hooks/ListContext.tsx).
// Only the owner can invite/remove people (there's exactly one owner per list, the
// person it was auto-provisioned for) — a non-owner member never sees this modal,
// see the isOwner-gated menu item in Layout.tsx.
export const ListMembersModal = ({ onClose }: ListMembersModalProps) => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { activeList } = useActiveList()
  const [invites, setInvites] = useState<InviteEntry[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [emailWarning, setEmailWarning] = useState<string | null>(null)

  useEffect(() => {
    if (!activeList) return
    return onValue(invitesRef(activeList.owner), (snapshot) =>
      setInvites(Object.values(snapshot.val() || {}) as InviteEntry[])
    )
  }, [activeList?.owner])

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
      // Best-effort — the invite itself (inviteToList's Firebase write) already
      // succeeded before the email send is even attempted, so a delivery failure
      // (e.g. SMTP not configured yet) never blocks or reverts the actual grant.
      const result = await inviteToList(activeList.owner, trimmed, user?.email)
      setNewEmail('')
      if (result.error) setEmailWarning(t('admins:emailNotSent'))
    } catch (err: any) {
      setError(`${t('admins:addFailed')}: ${err.message}`)
    }
  }

  const handleRemove = async (email: string) => {
    try {
      await removeListMember(activeList.owner, email)
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
          <div className="category-row">
            <span className="admin-email">{activeList.owner}</span>
            <span className="admin-owner-tag">{t('admins:ownerTag')}</span>
          </div>
          {invites.map((invite) => (
            <div className="category-row" key={invite.email}>
              <span className="admin-email">
                {invite.email}
                {invite.status === 'pending' && (
                  <span className="admin-pending-tag"> · {t('admins:pendingTag')}</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-[26px] w-[26px]"
                onClick={() => handleRemove(invite.email)}
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
        {emailWarning && <div className="text-sm text-muted-foreground">{emailWarning}</div>}

        <DialogFooter>
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
