import { useEffect, useState } from 'react'
import { Share2, UserPlus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { shoppingSharingRequest } from '../client/api/shoppingSharing'
import type { ShoppingShareMember, ShoppingShareSnapshot } from '../modules/shoppingSharing'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import './shopping-sharing.css'

export function ListMemberAvatars({ members }: { members: ShoppingShareMember[] }) {
  const { t } = useTranslation('lists')
  return <div className="list-member-avatars" aria-label={t('sharing.members')}>
    {members.slice(0, 5).map(member => <span className="list-member-avatar" key={member.email} title={member.displayName || member.email}>
      {member.photoURL && /^https:\/\//.test(member.photoURL)
        ? <img src={member.photoURL} alt={member.displayName} referrerPolicy="no-referrer" />
        : <span aria-label={member.displayName}>{(member.displayName || member.email).slice(0, 2).toUpperCase()}</span>}
    </span>)}
    {members.length > 5 && <span className="list-member-avatar">+{members.length - 5}</span>}
  </div>
}

interface Props {
  householdId: string
  listName: string | null
  initiallyOpen?: boolean
  onClose?: () => void
}

export default function ListSharingBar({ householdId, listName, initiallyOpen = false, onClose }: Props) {
  const { t } = useTranslation('lists')
  const [open, setOpen] = useState(initiallyOpen)
  const [roster, setRoster] = useState<ShoppingShareSnapshot | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const scope = { householdId, listName }
  const refresh = async (signal?: AbortSignal) => {
    const next = await shoppingSharingRequest<ShoppingShareSnapshot>({ action: 'roster', ...scope }, signal)
    if (signal?.aborted) return
    setRoster(next)
    setLoaded(true)
    setError(false)
  }
  useEffect(() => {
    const controller = new AbortController()
    setRoster(null)
    setLoaded(false)
    setError(false)
    refresh(controller.signal).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [householdId, listName])

  const changeMember = async (action: 'invite' | 'revoke', address: string) => {
    setBusy(true)
    setError(false)
    try {
      await shoppingSharingRequest({ action, ...scope, email: address.trim().toLowerCase() })
      if (action === 'invite') setEmail('')
      await refresh()
    } catch { setError(true) }
    finally { setBusy(false) }
  }
  const close = () => { setOpen(false); onClose?.() }
  const name = listName || t('sharing.permanentList')

  return <>
    <div className="list-sharing-bar">
      {roster && <ListMemberAvatars members={[roster.owner, ...roster.members]} />}
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2 size={16} aria-hidden="true" /> {t('sharing.shareList')}
      </Button>
    </div>
    <Dialog open={open} onOpenChange={value => value ? setOpen(true) : close()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('sharing.title', { name })}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t('sharing.explanation')}</p>
        {roster && <ul className="sharing-member-list">
          {[roster.owner, ...roster.members].map((member, index) => <li key={member.email}>
            <ListMemberAvatars members={[member]} />
            <div className="sharing-member-name"><strong>{member.displayName}</strong><span dir="ltr">{member.email}</span></div>
            {index === 0 ? <span>{t('sharing.owner')}</span> : <Button variant="ghost" size="icon" disabled={busy}
              aria-label={t('sharing.remove', { email: member.email })} onClick={() => changeMember('revoke', member.email)}><X size={16} /></Button>}
          </li>)}
        </ul>}
        <form className="sharing-invite-form" onSubmit={event => { event.preventDefault(); if (!busy) void changeMember('invite', email) }}>
          <label className="sr-only" htmlFor="sharing-email">{t('sharing.email')}</label>
          <Input id="sharing-email" type="email" required maxLength={254} dir="ltr" autoComplete="email"
            value={email} onChange={event => setEmail(event.target.value)} placeholder={t('sharing.email')} disabled={busy || !loaded} />
          <Button type="submit" disabled={busy || !loaded || !email.trim()}><UserPlus size={16} aria-hidden="true" />{t('sharing.add')}</Button>
        </form>
        {error && <div role="alert" className="text-sm text-destructive">{t('sharing.failed')} <button onClick={() => refresh().catch(() => setError(true))}>{t('sharing.retry')}</button></div>}
        {!loaded && !error && <p role="status">{t('sharing.loading')}</p>}
      </DialogContent>
    </Dialog>
  </>
}
