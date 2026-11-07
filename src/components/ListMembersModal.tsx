import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { createMembersApiClient, type ListMembershipSummary } from '../client/api/members'
import { useDialogService } from '../hooks/DialogServiceContext'
import { useActiveList } from '../hooks/ListContext'
import { getCurrentUserIdToken, sanitizeEmailKey } from '../lib/firebase'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

type UsersManagementModalProps = { onClose: () => void }

const api = createMembersApiClient({ getIdToken: getCurrentUserIdToken })

export function UsersManagementModal({ onClose }: UsersManagementModalProps) {
  const { t } = useTranslation('admins')
  const { myLists, setActiveListId } = useActiveList()
  const { confirm } = useDialogService()
  const listIdentity = myLists.map((list) => sanitizeEmailKey(list.id)).sort().join(',')
  const [summaries, setSummaries] = useState<ListMembershipSummary[]>([])
  const [newEmail, setNewEmail] = useState<Record<string, string>>({})
  const [inviteLanguage, setInviteLanguage] = useState<Record<string, 'he' | 'en'>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const listIds = listIdentity ? listIdentity.split(',') : []
      setSummaries(await Promise.all(listIds.map((listId) => api.getSummary(listId))))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [listIdentity])

  useEffect(() => { void load() }, [load])

  const mutate = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError(false)
    try {
      await operation()
      await load()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const invite = (listId: string) => {
    const email = newEmail[listId]?.trim() ?? ''
    if (!email) return
    void mutate(async () => {
      await api.invite(listId, email, inviteLanguage[listId] ?? 'he')
      setNewEmail((current) => ({ ...current, [listId]: '' }))
    })
  }

  const leave = async (summary: ListMembershipSummary) => {
    if (!await confirm(t('leaveConfirm', { listName: summary.name }))) return
    setBusy(true)
    setError(false)
    try {
      await api.leave(summary.listId)
      setSummaries((current) => current.filter((item) => item.listId !== summary.listId))
      const owned = myLists.find((list) => list.status === 'owner')
      if (owned) setActiveListId(owned.id)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const owned = summaries.filter((summary) => summary.isOwner)
  const incoming = summaries.filter((summary) => !summary.isOwner)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('usersTitle')}</DialogTitle></DialogHeader>
        <p className="modal-note-readonly">{t('usersExplanation')}</p>
        {loading && <p role="status">{t('loading')}</p>}
        {error && <div role="alert" className="text-sm text-destructive">
          {t('loadFailed')}{' '}<button type="button" onClick={() => void load()}>{t('retry')}</button>
        </div>}
        {!loading && !error && <div className="grid gap-5">
          <section aria-labelledby="shared-by-me-title">
            <h3 id="shared-by-me-title" className="font-semibold">{t('sharedByMe')}</h3>
            {owned.length === 0 && <p>{t('emptySharedByMe')}</p>}
            {owned.map((summary) => <div className="grid gap-3" key={summary.listId}>
              <h4>{summary.name}</h4>
              {summary.members.length === 0 && <p>{t('noParticipants')}</p>}
              <ul className="sharing-member-list">
                {summary.members.map((member) => <li key={member.email}>
                  <span className="list-member-avatar" aria-hidden="true">{member.email.slice(0, 2).toUpperCase()}</span>
                  <div className="sharing-member-name"><strong dir="ltr">{member.email}</strong><span>{t(member.status === 'approved' ? 'approved' : 'pendingTag')}</span></div>
                  <label>{t('notificationLanguage')}
                    <select disabled={busy} value={member.notificationLanguage} onChange={(event) => void mutate(() => api.setNotificationLanguage(summary.listId, member.email, event.target.value as 'he' | 'en'))}>
                      <option value="he">{t('hebrew')}</option><option value="en">{t('english')}</option>
                    </select>
                  </label>
                  <Button variant="ghost" disabled={busy} onClick={() => void mutate(() => api.revoke(summary.listId, member.email))}>{t('removeAdmin')}</Button>
                </li>)}
              </ul>
              <div className="sharing-invite-form">
                <Input type="email" dir="ltr" aria-label={t('emailPlaceholder')} placeholder={t('emailPlaceholder')} value={newEmail[summary.listId] ?? ''} onChange={(event) => setNewEmail((current) => ({ ...current, [summary.listId]: event.target.value }))} />
                <select aria-label={t('notificationLanguage')} value={inviteLanguage[summary.listId] ?? 'he'} onChange={(event) => setInviteLanguage((current) => ({ ...current, [summary.listId]: event.target.value as 'he' | 'en' }))}>
                  <option value="he">{t('hebrew')}</option><option value="en">{t('english')}</option>
                </select>
                <Button disabled={busy || !newEmail[summary.listId]?.trim()} onClick={() => invite(summary.listId)}>{t('addAdmin')}</Button>
              </div>
            </div>)}
          </section>
          <section aria-labelledby="shared-with-me-title">
            <h3 id="shared-with-me-title" className="font-semibold">{t('sharedWithMe')}</h3>
            {incoming.length === 0 && <p>{t('emptySharedWithMe')}</p>}
            <ul className="sharing-member-list">
              {incoming.map((summary) => <li key={summary.listId}>
                <div className="sharing-member-name"><strong>{summary.name}</strong><span dir="ltr">{t('sharedBy', { email: summary.ownerEmail })}</span></div>
                <Button variant="destructive" disabled={busy} onClick={() => void leave(summary)}>{t('leave')}</Button>
              </li>)}
            </ul>
          </section>
        </div>}
        <DialogFooter><Button onClick={onClose}>{t('close')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
